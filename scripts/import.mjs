#!/usr/bin/env node
/**
 * A1 · 数据导入
 *
 * 把 JSONL 面试题库导出（每行一个 JSON 对象）转成：
 *   - import/seed.sql   D1 可直接执行：PRAGMA → INSERT ... → PRAGMA
 *   - import/report.txt 人读的导入报告（总数 / 去重 / 丢弃 / 分类分布 / 隐藏列表）
 *
 * 契约来源（以文档为准）：
 *   docs/api.md · api/src/db/schema.sql · api/src/types.ts
 *
 * 依赖：零。只用 node 内置模块。Node 18+（ESM）。
 * 用法：node scripts/import.mjs [可选的 JSONL 路径]
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(HERE, '..');

/** 约定的数据源；第一个命令行参数可覆盖（方便换库重跑） */
const DEFAULT_SOURCE = 'D:\\mowen\\files\\前端文章合计\\database_export-ai_interview.json';
const SOURCE_PATH = process.argv[2] ? resolve(process.cwd(), process.argv[2]) : DEFAULT_SOURCE;

const OUT_DIR = join(PROJECT_ROOT, 'import');
const SEED_PATH = join(OUT_DIR, 'seed.sql');
const REPORT_PATH = join(OUT_DIR, 'report.txt');

/** 严格按约定的 14 列、固定顺序 */
const COLUMNS = [
  'id', 'title', 'content', 'analysis', 'category',
  'author_id', 'is_ai', 'status', 'risk_tier', 'review_round',
  'reject_reason', 'views', 'created_at', 'updated_at',
];
const INSERT_PREFIX = `INSERT OR IGNORE INTO questions (${COLUMNS.join(',')}) VALUES `;

/** 哪些列是字符串（SQL 里要带引号），其余是 NULL / 整数 */
const TEXT_COLUMNS = new Set(['id', 'title', 'content', 'analysis', 'category', 'status', 'risk_tier']);

/**
 * 导入的题目一律 published。
 * 历史「标题含 React 就隐藏」的规则已作废（2026-11-05 更正：题库需要 React 内容）。
 * hidden 状态保留给管理员后续下架用。
 */

// ── 小工具 ──────────────────────────────────────────────

/** SQL 字符串字面量：单引号转义为两个单引号（不做反斜杠转义，SQLite 不认） */
function sqlText(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

/** 一个单元格的 SQL 形式 */
function sqlLiteral(value) {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'number') {
    if (!Number.isInteger(value)) throw new Error(`非整数值无法写入 INTEGER 列：${value}`);
    return String(value);
  }
  return sqlText(value);
}

/** createTime 形如 { "$date": "2026-08-15T05:25:38.267Z" } → epoch 毫秒 */
function toEpochMs(createTime) {
  const raw = createTime && typeof createTime === 'object' ? createTime.$date : createTime;
  if (typeof raw === 'number' && Number.isFinite(raw)) return Math.trunc(raw);
  if (typeof raw === 'string') {
    const ms = Date.parse(raw);
    if (Number.isFinite(ms)) return ms;
  }
  return null;
}

/** isAiGenerated → is_ai(1/0) */
function toFlag(value) {
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (typeof value === 'number') return value ? 1 : 0;
  if (typeof value === 'string') return value.toLowerCase() === 'true' || value === '1' ? 1 : 0;
  return 0;
}

/** 文本是否为空（undefined / null / 纯空白） */
function isBlank(value) {
  return typeof value !== 'string' || value.trim() === '';
}

/** 终端/报告里对齐中文用：CJK 按 2 列宽算 */
function displayWidth(text) {
  let width = 0;
  for (const ch of String(text)) {
    const cp = ch.codePointAt(0);
    const wide =
      (cp >= 0x1100 && cp <= 0x115f) ||
      (cp >= 0x2e80 && cp <= 0xa4cf) ||
      (cp >= 0xac00 && cp <= 0xd7a3) ||
      (cp >= 0xf900 && cp <= 0xfaff) ||
      (cp >= 0xfe30 && cp <= 0xfe4f) ||
      (cp >= 0xff00 && cp <= 0xff60) ||
      (cp >= 0xffe0 && cp <= 0xffe6);
    width += wide ? 2 : 1;
  }
  return width;
}

function padRight(text, width) {
  return text + ' '.repeat(Math.max(0, width - displayWidth(text)));
}

/** 本地时间戳（报告用，人不看 ISO 也认） */
function stamp() {
  const d = new Date();
  const p = (n, w = 2) => String(n).padStart(w, '0');
  const offset = -d.getTimezoneOffset();
  const sign = offset >= 0 ? '+' : '-';
  const abs = Math.abs(offset);
  return (
    `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ` +
    `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())} ` +
    `${sign}${p(Math.floor(abs / 60))}:${p(abs % 60)}`
  );
}

// ── 读取 + 逐行解析 JSONL ───────────────────────────────

function readJsonl(path) {
  const raw = readFileSync(path, 'utf8').replace(/^\uFEFF/, '');
  const lines = raw.split(/\r?\n/);
  if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop(); // 文件末尾的换行不算空行

  const records = [];
  const badLines = [];
  let blankLines = 0;
  let totalLines = 0;

  lines.forEach((line, index) => {
    if (line.trim() === '') {
      blankLines += 1;
      return;
    }
    totalLines += 1;
    try {
      const obj = JSON.parse(line);
      if (obj === null || typeof obj !== 'object' || Array.isArray(obj)) {
        throw new Error('不是 JSON 对象');
      }
      records.push({ obj, lineNo: index + 1 });
    } catch (err) {
      // 坏行只计数、不中断
      badLines.push({ lineNo: index + 1, reason: err.message });
    }
  });

  return { records, badLines, blankLines, totalLines };
}

// ── 映射 + 清洗 + 去重 ──────────────────────────────────

function buildRows(records) {
  const drop = { emptyTitle: 0, emptyAnalysis: 0, badDate: 0 };
  const seenTitles = new Set();
  const dupExamples = [];
  const rows = [];
  let duplicates = 0;

  for (const { obj } of records) {
    const title = obj.title;
    const analysis = obj.analysis;

    if (isBlank(title)) { drop.emptyTitle += 1; continue; }
    if (isBlank(analysis)) { drop.emptyAnalysis += 1; continue; }

    const createdAt = toEpochMs(obj.createTime);
    if (createdAt === null) { drop.badDate += 1; continue; }

    // 按 title 去重，保留首次出现
    if (seenTitles.has(title)) {
      duplicates += 1;
      if (dupExamples.length < 5) dupExamples.push(title);
      continue;
    }
    seenTitles.add(title);

    rows.push({
      id: String(obj._id ?? ''),
      title,
      content: typeof obj.content === 'string' ? obj.content : '',
      analysis,
      category: typeof obj.category === 'string' && obj.category.trim() !== '' ? obj.category : '未分类',
      author_id: null,
      is_ai: toFlag(obj.isAiGenerated),
      status: 'published',
      risk_tier: 'low',
      review_round: 0,
      reject_reason: null,
      views: 0,
      created_at: createdAt,
      updated_at: createdAt,
    });
  }

  return { rows, drop, dupExamples, duplicates };
}

// ── 生成 seed.sql ──────────────────────────────────────

function renderSeed(rows, meta) {
  const head = [
    'PRAGMA foreign_keys=OFF;',
    `-- 面试题库 seed：${rows.length} 条，由 scripts/import.mjs 自动生成（勿手改，生成于 ${meta.generatedAt}）；单引号已按 SQL 规则转义`,
  ];
  const body = rows.map((row) => INSERT_PREFIX + '(' + COLUMNS.map((c) => sqlLiteral(row[c])).join(',') + ');');
  const tail = ['PRAGMA foreign_keys=ON;'];
  return head.concat(body, tail).join('\n') + '\n';
}

// ── 自检：把 seed.sql 读回来，逐行反解析并与内存中的行比对 ──

/** 反解析一条 INSERT 的 VALUES 区，正确处理 '' 转义与字符串内的逗号/换行 */
function parseValues(body) {
  const values = [];
  let i = 0;
  while (i < body.length) {
    const ch = body[i];
    if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r' || ch === ',') { i += 1; continue; }
    if (ch === "'") {
      i += 1;
      let text = '';
      let closed = false;
      while (i < body.length) {
        if (body[i] === "'") {
          if (body[i + 1] === "'") { text += "'"; i += 2; continue; }
          i += 1;
          closed = true;
          break;
        }
        text += body[i];
        i += 1;
      }
      if (!closed) throw new Error('字符串字面量没有闭合（单引号数量为奇数）');
      values.push({ quoted: true, text });
      continue;
    }
    let j = i;
    while (j < body.length && body[j] !== ',') j += 1;
    values.push({ quoted: false, text: body.slice(i, j).trim() });
    i = j;
  }
  return values;
}

/**
 * 按语句切分（不是按物理行）。
 * 必须这样做的原因：content / analysis 里有真实换行，一条 INSERT 会跨多个物理行；
 * 而字符串字面量里也可能出现 ';' 与 '--'，不能裸切。
 */
function splitStatements(sql) {
  const statements = [];
  let buffer = '';
  let inString = false;
  let i = 0;

  while (i < sql.length) {
    const ch = sql[i];

    if (inString) {
      if (ch === "'") {
        if (sql[i + 1] === "'") { buffer += "''"; i += 2; continue; } // '' 转义，仍在字符串内
        inString = false;
        buffer += ch;
        i += 1;
        continue;
      }
      buffer += ch;
      i += 1;
      continue;
    }

    if (ch === "'") { inString = true; buffer += ch; i += 1; continue; }

    // 行注释：整段跳过
    if (ch === '-' && sql[i + 1] === '-') {
      while (i < sql.length && sql[i] !== '\n') i += 1;
      continue;
    }
    // 块注释
    if (ch === '/' && sql[i + 1] === '*') {
      const end = sql.indexOf('*/', i + 2);
      i = end < 0 ? sql.length : end + 2;
      continue;
    }

    if (ch === ';') {
      const statement = buffer.trim();
      if (statement !== '') statements.push(statement);
      buffer = '';
      i += 1;
      continue;
    }

    buffer += ch;
    i += 1;
  }

  return { statements, tail: buffer.trim() };
}

function validateSeed(seedText, rows) {
  const problems = [];
  const { statements, tail } = splitStatements(seedText);

  if (tail !== '') problems.push(`最后一个分号之后还有残余内容：${JSON.stringify(tail.slice(0, 40))}`);

  const first = statements[0] ?? '';
  const last = statements[statements.length - 1] ?? '';
  if (first.replace(/\s+/g, '') !== 'PRAGMAforeign_keys=OFF') problems.push(`第一条语句不是 PRAGMA foreign_keys=OFF（实际：${first.slice(0, 60)}）`);
  if (last.replace(/\s+/g, '') !== 'PRAGMAforeign_keys=ON') problems.push(`最后一条语句不是 PRAGMA foreign_keys=ON（实际：${last.slice(0, 60)}）`);

  const insertStmts = statements.filter((s) => s.startsWith(INSERT_PREFIX.trimEnd()));
  if (insertStmts.length !== rows.length) {
    problems.push(`INSERT 语句数 ${insertStmts.length} ≠ 预期 ${rows.length}`);
  }

  const otherStmts = statements.filter((s) => !s.startsWith(INSERT_PREFIX.trimEnd()) && !s.replace(/\s+/g, '').startsWith('PRAGMAforeign_keys='));
  if (otherStmts.length > 0) problems.push(`出现 ${otherStmts.length} 条非预期语句`);

  const limit = Math.min(insertStmts.length, rows.length);
  for (let n = 0; n < limit; n += 1) {
    const statement = insertStmts[n];
    const row = rows[n];
    if (!statement.endsWith(')')) { problems.push(`第 ${n + 1} 条 INSERT 未以 ")" 结尾`); continue; }

    const marker = ' VALUES ';
    const at = statement.indexOf(marker);
    if (at < 0) { problems.push(`第 ${n + 1} 条 INSERT 缺少 VALUES 子句`); continue; }
    const openIdx = at + marker.length;
    if (statement[openIdx] !== '(') { problems.push(`第 ${n + 1} 条 INSERT 的 VALUES 后不是左括号`); continue; }
    const body = statement.slice(openIdx + 1, statement.length - 1);

    let values;
    try {
      values = parseValues(body);
    } catch (err) {
      problems.push(`第 ${n + 1} 条 INSERT 无法反解析：${err.message}`);
      continue;
    }
    if (values.length !== COLUMNS.length) {
      problems.push(`第 ${n + 1} 条 INSERT 有 ${values.length} 个值，应为 ${COLUMNS.length}`);
      continue;
    }

    for (let c = 0; c < COLUMNS.length; c += 1) {
      const column = COLUMNS[c];
      const expected = row[column];
      const got = values[c];
      const shouldQuote = TEXT_COLUMNS.has(column) && expected !== null;

      if (got.quoted !== shouldQuote) {
        problems.push(`第 ${n + 1} 条 ${column} 引号形态不对（期望${shouldQuote ? '带' : '不带'}引号）`);
        break;
      }
      const expectedText = expected === null ? 'NULL' : String(expected);
      if (got.text !== expectedText) {
        problems.push(`第 ${n + 1} 条 ${column} 回读不一致：${JSON.stringify(got.text.slice(0, 40))} ≠ ${JSON.stringify(expectedText.slice(0, 40))}`);
        break;
      }
    }
    if (problems.length >= 10) break;
  }

  const physicalLines = seedText.replace(/\n$/, '').split('\n').length;
  const insertLineCount = seedText.split('\n').filter((line) => line.startsWith(INSERT_PREFIX.trimEnd())).length;

  return {
    ok: problems.length === 0 && insertStmts.length === rows.length,
    insertStatements: insertStmts.length,
    insertLineCount,
    physicalLines,
    problems,
  };
}

// ── main ───────────────────────────────────────────────

function main() {
  if (!existsSync(SOURCE_PATH)) {
    console.error(`❌ 找不到数据源：${SOURCE_PATH}`);
    process.exitCode = 1;
    return;
  }

  const { records, badLines, blankLines, totalLines } = readJsonl(SOURCE_PATH);
  const { rows, drop, dupExamples, duplicates } = buildRows(records);

  mkdirSync(OUT_DIR, { recursive: true });

  const generatedAt = stamp();
  const seedText = renderSeed(rows, { generatedAt });
  writeFileSync(SEED_PATH, seedText, 'utf8');

  // 分类分布（count 降序，同数按名称升序，结果稳定）
  const categoryMap = new Map();
  for (const row of rows) categoryMap.set(row.category, (categoryMap.get(row.category) ?? 0) + 1);
  const categories = [...categoryMap.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));

  const hidden = rows.filter((row) => row.status === 'hidden');
  const published = rows.length - hidden.length;
  const aiCount = rows.filter((row) => row.is_ai === 1).length;
  const apostoRows = rows.filter((row) => /'/.test(row.title + row.content + row.analysis + row.category + row.status)).length;

  // 自检
  const check = validateSeed(readFileSync(SEED_PATH, 'utf8'), rows);

  // ── report.txt ──
  const out = [];
  out.push('========================================');
  out.push(' 面试题库 · 数据导入报告（A1）');
  out.push('========================================');
  out.push(`生成时间   ：${generatedAt}`);
  out.push(`数据源     ：${SOURCE_PATH}`);
  out.push(`SQL 输出   ：import/seed.sql`);
  out.push('');
  out.push('【一】解析（JSONL 逐行）');
  out.push(`  ${padRight('非空行数', 20)}${totalLines}`);
  out.push(`  ${padRight('JSON 解析成功', 20)}${records.length}`);
  out.push(`  ${padRight('坏行（解析失败）', 20)}${badLines.length}`);
  out.push(`  ${padRight('空行（忽略）', 20)}${blankLines}`);
  for (const bad of badLines.slice(0, 10)) {
    out.push(`    · 第 ${bad.lineNo} 行：${bad.reason}`);
  }
  out.push('');
  out.push('【二】清洗与去重');
  out.push(`  ${padRight('解析成功记录', 20)}${records.length}`);
  out.push(`  ${padRight('丢弃 · 空标题', 20)}${drop.emptyTitle}`);
  out.push(`  ${padRight('丢弃 · 空 analysis', 20)}${drop.emptyAnalysis}`);
  out.push(`  ${padRight('丢弃 · 时间无效', 20)}${drop.badDate}`);
  out.push(`  ${padRight('去重 · 标题重复', 20)}${duplicates}`);
  out.push(`  ${padRight('去重后入库', 20)}${rows.length}`);
  if (dupExamples.length > 0) {
    out.push('  重复标题示例（保留首次出现）：');
    for (const title of dupExamples) out.push(`    · ${title}`);
  }
  out.push('');
  out.push('【三】写入 questions');
  out.push(`  ${padRight("status='published'", 20)}${published}`);
  out.push(`  ${padRight("status='hidden'", 20)}${hidden.length}`);
  out.push(`  ${padRight('is_ai = 1', 20)}${aiCount}`);
  out.push(`  ${padRight("risk_tier='low'", 20)}${rows.length}`);
  out.push(`  ${padRight('author_id = NULL', 20)}${rows.length}`);
  out.push(`  ${padRight('分类数', 20)}${categories.length}`);
  out.push('');
  out.push(`【四】分类分布（${categories.length} 类）`);
  const nameWidth = categories.length > 0 ? Math.max(...categories.map((c) => displayWidth(c.name))) : 0;
  for (const { name, count } of categories) {
    out.push(`  ${padRight(name, nameWidth + 4)}${count}`);
  }
  out.push(`  ${padRight('合计', nameWidth + 4)}${rows.length}`);
  out.push('');
  out.push(`【五】被隐藏条目（status='hidden'，标题含 react，共 ${hidden.length} 条）`);
  hidden.forEach((row, i) => {
    out.push(`  ${String(i + 1).padStart(2, ' ')}. ${row.title}`);
  });
  out.push('');
  out.push('【六】自检');
  out.push(`  ${padRight('seed.sql 的 INSERT 语句数', 26)}${check.insertStatements}`);
  out.push(`  ${padRight('预期语句数', 26)}${rows.length}`);
  out.push(`  ${padRight('以 INSERT 开头的行数', 26)}${check.insertLineCount}`);
  out.push(`  ${padRight('文件物理行数', 26)}${check.physicalLines}`);
  out.push(`  ${padRight('列数（应为 14）', 26)}${check.problems.length === 0 ? `14 × ${rows.length} 全部逐行反解析` : '见下方问题'}`);
  out.push(`  ${padRight('含单引号需转义的行', 26)}${apostoRows}（回读已逐个比对）`);
  out.push(`  ${padRight('校验结果', 26)}${check.ok ? '✅ 一致' : '❌ 不一致'}`);
  for (const problem of check.problems) out.push(`    · ${problem}`);
  out.push('');
  out.push('【七】格式说明');
  out.push('  · 一条记录一条 INSERT 语句（共 ' + rows.length + ' 条），语句之间以 ";" 分隔；');
  out.push('  · content / analysis 含 Markdown 换行，SQLite 字符串字面量不支持 \\n 转义，');
  out.push('    为保证"原样"入库，换行按真实换行保留，故一条语句会占多个物理行；');
  out.push('  · 单引号已按 SQL 规则写成两个单引号；反斜杠不做转义（SQLite 不认）。');
  out.push('');

  writeFileSync(REPORT_PATH, concatReport(out), 'utf8');

  // ── stdout ──
  console.log(`数据源：${SOURCE_PATH}`);
  console.log(`解析（有效记录）：${records.length} 条（坏行 ${badLines.length}，空行 ${blankLines}）`);
  console.log(`去重后：${rows.length} 条（丢弃 ${drop.emptyTitle + drop.emptyAnalysis + drop.badDate}，标题重复 ${duplicates}）`);
  console.log(`分类：${categories.length} 个`);
  for (const { name, count } of categories) console.log(`  ${padRight(name, nameWidth + 4)}${count}`);
  console.log(`status='published'：${published} 条`);
  console.log(`status='hidden'（标题含 React）：${hidden.length} 条`);
  console.log(`seed.sql INSERT 语句数：${check.insertStatements} / 预期 ${rows.length}（以 INSERT 开头的行数 ${check.insertLineCount}，物理行 ${check.physicalLines}）`);
  console.log(`已写出：${SEED_PATH}`);
  console.log(`已写出：${REPORT_PATH}`);

  if (check.ok) {
    console.log(`✅ 校验通过：seed.sql 的 INSERT 语句数与预期 ${rows.length} 完全一致，14 列逐行反解析全部匹配`);
  } else {
    console.error('❌ 校验失败：');
    for (const problem of check.problems) console.error(`  · ${problem}`);
    process.exitCode = 1;
  }
}

function concatReport(lines) {
  return lines.join('\n') + '\n';
}

main();
