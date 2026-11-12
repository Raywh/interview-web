/**
 * 从开源仓库抓「题目」——只取题干，解析留空（由后续 AI 补或人工补）。
 *
 * 用法：
 *   node scripts/fetch-github-questions.mjs --repo haizlin --category css,js --limit 100
 *   node scripts/fetch-github-questions.mjs --repo lgwebdream --category css,javascript --limit 50
 *
 * 输出 JSONL（与 import.mjs 兼容），写到 import/github-questions.jsonl
 *
 * 说明：
 *  - 只抓题干，不抓答案，避免大段复制原文（版权 + 质量都更可控）
 *  - category 映射到本站白名单，映射不到的题目直接丢弃并计数
 *  - 网络读取用 raw.githubusercontent.com，只读公开文件
 */
import { writeFileSync } from 'node:fs';

const args = process.argv.slice(2);
function arg(name, fallback) {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
}

const REPO = arg('repo', 'haizlin');
const CATEGORIES = (arg('category', 'css,js') || '').split(',').map((s) => s.trim()).filter(Boolean);
const LIMIT = Number(arg('limit', '100'));
const OUT = arg('out', 'import/github-questions.jsonl');

/** 仓库定义：raw 文件路径模板 + 分类映射 + 题干正则 */
const SOURCES = {
  haizlin: {
    label: 'haizlin/fe-interview',
    license: 'MIT',
    // category/css.md 里的条目形如：- [题干](https://github.com/.../issues/123)
    files: {
      css: 'category/css.md',
      js: 'category/js.md',
      html: 'category/html.md',
      ECMAScript: 'category/ECMAScript.md',
      nodejs: 'category/nodejs.md',
    },
    linePattern: /^[-*]\s*\[([^\]]+)\]\(https:\/\/github\.com\/haizlin\/fe-interview\/issues\/\d+\)/,
  },
  lgwebdream: {
    label: 'lgwebdream/FE-Interview',
    license: 'CC BY-NC 4.0',
    files: {
      css: 'summarry/css.md',
      javascript: 'summarry/javascript.md',
      html: 'summarry/html.md',
    },
    // 该仓库用 ### 标题，题干就是标题文本
    headingPattern: /^#{2,4}\s+(.+?)\s*$/,
  },
  yangshun: {
    label: 'yangshun/front-end-interview-handbook',
    license: 'MIT',
    files: {
      css: 'questions/css-questions.md',
      javascript: 'questions/javascript-questions.md',
      html: 'questions/html-questions.md',
    },
    headingPattern: /^#{2,4}\s+(.+?)\s*$/,
  },
};

/** 仓库分类 → 本站白名单分类（映射不到的丢弃） */
const CATEGORY_MAP = {
  css: 'CSS',
  js: 'JS',
  javascript: 'JS',
  ECMAScript: 'JS',
  html: 'HTML',
  nodejs: 'Node.js',
};

const SOURCE = SOURCES[REPO];
if (!SOURCE) {
  console.error(`未知仓库：${REPO}。可选：${Object.keys(SOURCES).join(' / ')}`);
  process.exit(1);
}

const UA = { 'User-Agent': 'interview-web-import/1.0' };

async function fetchText(path) {
  const url = `https://raw.githubusercontent.com/${SOURCE.label}/master/${path}`;
  const res = await fetch(url, { headers: UA });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.text();
}

function extractTitles(text, fileKeys) {
  const titles = [];
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    const m = fileKeys.linePattern
      ? trimmed.match(fileKeys.linePattern)
      : trimmed.match(fileKeys.headingPattern);
    if (!m) continue;
    const title = (m[1] ?? '').replace(/[*_`]/g, '').trim();
    if (title) titles.push(title);
  }
  return titles;
}

function normalizeTitle(title) {
  return title.replace(/\s+/g, ' ').replace(/[？?]+$/, '').trim();
}

function isUsable(title) {
  const chars = Array.from(title).length;
  if (chars < 8 || chars > 120) return false;
  // 过滤「目录 / 更新日志」这类非题目
  if (/^(目录|更新|前言|说明|参考|目录结构)$/.test(title)) return false;
  return true;
}

function fakeId(title) {
  // 稳定 24 位十六进制：用简单哈希，同一标题永远同一个 id（便于重复导入去重）
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (const ch of title) {
    const code = ch.codePointAt(0) ?? 0;
    h1 = (h1 ^ code) * 16777619 >>> 0;
    h2 = (h2 + code * 31) >>> 0;
  }
  return (h1.toString(16).padStart(8, '0') + h2.toString(16).padStart(8, '0') + h2.toString(16).padStart(8, '0')).slice(0, 24);
}

const records = [];
const stats = { fetched: 0, droppedCategory: 0, droppedUnusable: 0, dupInBatch: 0 };
const seen = new Set();

for (const rawCategory of CATEGORIES) {
  const mapped = CATEGORY_MAP[rawCategory];
  if (mapped === null) {
    console.log(`跳过 ${rawCategory}：本站白名单里没有对应分类`);
    continue;
  }
  if (!mapped) {
    console.warn(`未知分类 ${rawCategory}，跳过`);
    continue;
  }
  const file = SOURCE.files[rawCategory];
  if (!file) {
    console.warn(`${SOURCE.label} 没有 ${rawCategory} 的索引文件，跳过`);
    continue;
  }

  let text;
  try {
    text = await fetchText(file);
  } catch (err) {
    console.error(`拉取失败 ${file}：${err.message}`);
    continue;
  }

  const titles = extractTitles(text, SOURCE).slice(0, LIMIT);
  for (const raw of titles) {
    stats.fetched += 1;
    const title = normalizeTitle(raw);
    if (!isUsable(title)) {
      stats.droppedUnusable += 1;
      continue;
    }
    if (seen.has(title)) {
      stats.dupInBatch += 1;
      continue;
    }
    seen.add(title);
    records.push({
      _id: fakeId(title),
      title,
      content: title,
      analysis: '',
      category: mapped,
      createTime: { $date: '2026-11-12T12:00:00.000Z' },
      isAiGenerated: false,
      _source: SOURCE.label,
    });
  }
  console.log(`${rawCategory} → ${mapped}：取 ${titles.length} 条`);
}

writeFileSync(OUT, records.map((r) => JSON.stringify(r)).join('\n') + '\n', 'utf8');

console.log('');
console.log(`来源      ：${SOURCE.label}（${SOURCE.license}）`);
console.log(`抓取      ：${stats.fetched} 条`);
console.log(`不可用丢弃：${stats.droppedUnusable} 条（太短/太长/目录项）`);
console.log(`批次内重复：${stats.dupInBatch} 条`);
console.log(`输出      ：${records.length} 条 → ${OUT}`);
console.log(`分类分布  ：${JSON.stringify(records.reduce((acc, r) => { acc[r.category] = (acc[r.category] ?? 0) + 1; return acc; }, {}))}`);
