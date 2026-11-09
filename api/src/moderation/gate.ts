/**
 * 内容门禁（A3）—— 移植 D:\deep-harness\review-gate\scripts\review.mjs 的
 * `classify` / `raiseTier` / `matchPath` 判定语义，输入从「改动的文件路径」换成
 * 「内容里抽出的信号」。
 *
 * review-gate 的判定链（照抄，不自己发明规则）：
 *   1. 对每个 tier（high → medium → low）用 `match` 里的 glob 命中输入，取命中最高档
 *   2. 一个都没命中 → `default_tier`
 *   3. `always_human.paths` 命中 → approvals ≥ always_human.approvals_required
 *   4. `content_escalators` 先全部收集再统一施加：effect='high' 强制 high；
 *      effect='raise' 升一级（high 封顶）；**顺序无关，forced-high 永远赢**
 *   5. approvals === 0 → 自动发布，否则人工
 *
 * 与 review-gate 的差异（仅输入适配层，判定逻辑不动）：
 *   - 输入是内容，不是路径。这里先把内容抽成 `has:link` / `has:code` / `has:image` /
 *     `has:contact` / `len:long` 这类「信号 token」，token 再拿去和配置 match。
 *   - 配置的 `always_human.paths` 写的是 `always:image` / `always:sensitive`，与信号
 *     不同名，用 `ALWAYS_HUMAN_ALIASES` 做映射（图片 → always:image，
 *     联系方式 → always:sensitive）。
 *   - 任务要求 always_human 命中时**强制 high**（review-gate 只抬高 approvals），
 *     这里按任务要求做，并在 `alwaysHit` 里保留命中项便于回溯。
 *
 * 配置来源：仓库根 `moderation.config.json`（构建时打进 bundle，运行时不读文件）。
 * 改配置只需改那个 JSON，本文件不用动。
 */
import configJson from '../../../moderation.config.json' with { type: 'json' };
import type { GateResult, Tier } from '../types';

// ── 配置结构（moderation.config.json 的 risk 段）─────────────

interface TierRule {
  approvals_required?: number;
  match?: string[];
  exclude?: string[];
}

interface EscalatorRule {
  id?: string;
  pattern?: string;
  effect?: string;
  why?: string;
}

/** 与 moderation.config.json 的 `risk` 同构 */
export interface RiskConfig {
  tiers?: Record<string, TierRule>;
  /** 'high' | 'medium' | 'low' */
  default_tier?: string;
  always_human?: { approvals_required?: number; paths?: string[] };
  content_escalators?: EscalatorRule[];
}

const config = configJson as unknown as { risk?: RiskConfig };

/** 仓库根 moderation.config.json 的 risk 段（evaluate 的默认配置） */
export const RISK_CONFIG: RiskConfig = config.risk ?? {};

/** 档位从高到低（review-gate 的 TIER_ORDER） */
export const TIER_ORDER: readonly Tier[] = ['high', 'medium', 'low'];

/** 门禁输入：题目给 title+content+analysis，评论只给 content */
export interface GateInput {
  title?: string;
  content: string;
  analysis?: string;
}

/** 从内容里抽出的信号（token 形如 has:link，与配置 match 对齐） */
export interface GateSignal {
  token: string;
  why: string;
}

// ── glob → 正则（review-gate 同名函数的移植）───────────────
// 支持 **、*、?、{a,b}；* 不跨 /，** 跨层级。

const REGEX_CACHE = new Map<string, RegExp>();

function escapeRe(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** 把 gitignore 风格的 glob 翻译成正则（与 review-gate 完全一致） */
export function globToRegex(pattern: string): RegExp {
  const cached = REGEX_CACHE.get(pattern);
  if (cached) return cached;

  const out: string[] = [];
  let i = 0;
  while (i < pattern.length) {
    if (pattern.slice(i, i + 3) === '**/') {
      out.push('(?:[^/]+/)*');
      i += 3;
      continue;
    }
    if (pattern.slice(i, i + 2) === '**') {
      out.push('.*');
      i += 2;
      continue;
    }
    const char = pattern[i] ?? '';
    if (char === '*') {
      out.push('[^/]*');
    } else if (char === '?') {
      out.push('[^/]');
    } else if (char === '{') {
      const end = pattern.indexOf('}', i);
      if (end !== -1) {
        const alternatives = pattern.slice(i + 1, end).split(',').map(escapeRe);
        out.push(`(?:${alternatives.join('|')})`);
        i = end + 1;
        continue;
      }
      out.push(escapeRe(char));
    } else {
      out.push(escapeRe(char));
    }
    i += 1;
  }

  const regex = new RegExp(`^${out.join('')}$`);
  REGEX_CACHE.set(pattern, regex);
  return regex;
}

/** 单个 token 是否命中 pattern（review-gate 的 matchPath） */
export function matchPath(token: string, pattern: string): boolean {
  return globToRegex(pattern).test(token.replace(/\\/g, '/'));
}

/** 升一级：low → medium → high，high 封顶（review-gate 的 raiseTier） */
export function raiseTier(tier: Tier): Tier {
  const index = TIER_ORDER.indexOf(tier);
  if (index === -1) return 'high';
  return TIER_ORDER[Math.max(index - 1, 0)] ?? 'high';
}

/** 配置里的档位字符串 → Tier；不合法返回 undefined */
export function normalizeTier(value: unknown): Tier | undefined {
  return TIER_ORDER.find((tier) => tier === value);
}

// ── 信号抽取 ────────────────────────────────────────────

/** 长文阈值：正文 > 5000 字 → len:long（moderation.config.json medium.match） */
export const LONG_TEXT_LIMIT = 5000;

const LINK_RX = /https?:\/\//i;
const CODE_FENCE_RX = /```/;
/** 4 空格缩进或 tab 开头的行，视为代码块 */
const CODE_INDENT_RX = /(?:^|\n)(?: {4}|\t)\S/;
const IMAGE_RX = /!\[[^\]]*\]\([^)]*\)|<img\b/i;
const PHONE_RX = /1[3-9]\d{9}/;
const EMAIL_RX = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;
const WECHAT_RX = /(微信|weixin|vx)\s*[:：]?\s*[a-zA-Z0-9_-]{5,}/i;

/** 信号 → always_human.paths 的别名（配置里两个命名空间不同名） */
const ALWAYS_HUMAN_ALIASES: Record<string, string[]> = {
  'has:image': ['always:image'],
  'has:contact': ['always:sensitive'],
};

const ALWAYS_HUMAN_WHY: Record<string, string> = {
  'always:image': '含图片，必须人工复核',
  'always:sensitive': '疑似敏感信息，必须人工复核',
};

/** 按「字」（code point）计数，避免 emoji 被算成 2 */
function charLength(text: string): number {
  return Array.from(text).length;
}

/** 参与扫描的全文：标题 + 正文 + 解析 */
export function joinText(input: GateInput): string {
  return [input.title, input.content, input.analysis]
    .filter((part): part is string => typeof part === 'string' && part.length > 0)
    .join('\n');
}

/** 抽信号：只有命中的信号才会进入 tiers 匹配 */
export function extractSignals(input: GateInput): GateSignal[] {
  const text = joinText(input);
  const signals: GateSignal[] = [];

  // high 级信号
  if (PHONE_RX.test(text) || EMAIL_RX.test(text) || WECHAT_RX.test(text)) {
    signals.push({ token: 'has:contact', why: '疑似联系方式' });
  }
  if (IMAGE_RX.test(text)) {
    signals.push({ token: 'has:image', why: '含图片' });
  }

  // medium 级信号
  if (LINK_RX.test(text)) {
    signals.push({ token: 'has:link', why: '含外链' });
  }
  if (CODE_FENCE_RX.test(text) || CODE_INDENT_RX.test(text)) {
    signals.push({ token: 'has:code', why: '含代码块' });
  }
  if (charLength(text) > LONG_TEXT_LIMIT) {
    signals.push({ token: 'len:long', why: '正文超长（超过 5000 字）' });
  }

  return signals;
}

// ── evaluate ───────────────────────────────────────────

/**
 * 门禁主入口。
 *
 * @param rawInput 评论可直接传字符串；题目传 { title, content, analysis }
 * @param risk     默认用仓库根的 moderation.config.json（测试可注入配置）
 */
export function evaluate(rawInput: string | GateInput, risk: RiskConfig = RISK_CONFIG): GateResult {
  const input: GateInput =
    typeof rawInput === 'string'
      ? { content: rawInput }
      : { ...rawInput, content: rawInput.content ?? '' };

  const text = joinText(input);
  const signals = extractSignals(input);
  const tokens = signals.map((signal) => signal.token);
  const signalByToken = new Map(signals.map((signal) => [signal.token, signal] as const));
  const tiers = risk.tiers ?? {};

  // 1) tiers[*].match：取命中最高档（TIER_ORDER 顺序即优先级）
  const byTier = new Map<Tier, string[]>();
  for (const tier of TIER_ORDER) {
    const tierRule = tiers[tier] ?? {};
    const patterns = tierRule.match ?? [];
    const excludes = tierRule.exclude ?? [];
    if (patterns.length === 0) continue;

    const hit = tokens.filter(
      (token) =>
        patterns.some((pattern) => matchPath(token, pattern)) &&
        !excludes.some((pattern) => matchPath(token, pattern)),
    );
    if (hit.length > 0) byTier.set(tier, hit);
  }

  let base: Tier;
  if (byTier.size > 0) {
    base = TIER_ORDER.find((tier) => byTier.has(tier)) ?? 'low';
  } else {
    base = normalizeTier(risk.default_tier) ?? 'low';
  }

  // 2) always_human：别名映射后与 paths 匹配
  const alwaysHuman = risk.always_human ?? {};
  const alwaysPaths = alwaysHuman.paths ?? [];
  const alwaysTokens = Array.from(
    new Set(tokens.flatMap((token) => ALWAYS_HUMAN_ALIASES[token] ?? [])),
  );
  const alwaysHit = alwaysTokens.filter((token) =>
    alwaysPaths.some((pattern) => matchPath(token, pattern)),
  );

  // 3) content_escalators：先全收集，再统一施加（顺序无关）
  const escalations: Array<{ id: string; why: string; effect: 'high' | 'raise' }> = [];
  for (const rule of risk.content_escalators ?? []) {
    const id = typeof rule.id === 'string' && rule.id.length > 0 ? rule.id : '?';
    const pattern = typeof rule.pattern === 'string' ? rule.pattern : '';
    if (!pattern) continue;

    let regex: RegExp;
    try {
      regex = new RegExp(pattern);
    } catch (err) {
      // 配置错误只警告，不让整条投稿挂掉（review-gate 记 error 后跳过）
      console.warn(`[gate] 忽略无效正则 ${id}: ${pattern}`, err);
      continue;
    }
    if (!regex.test(text)) continue;

    escalations.push({
      id,
      why: typeof rule.why === 'string' && rule.why.length > 0 ? rule.why : id,
      effect: rule.effect === 'high' ? 'high' : 'raise',
    });
  }

  const forcedHigh = escalations.filter((item) => item.effect === 'high');
  const raisers = escalations.filter((item) => item.effect === 'raise');

  // forced-high 永远赢：只要有 effect='high' 的升级器命中，直接 high
  if (forcedHigh.length > 0) {
    base = 'high';
  } else if (raisers.length > 0 && base !== 'high') {
    base = raiseTier(base);
  }

  // always_human 命中 → 强制 high（任务要求；review-gate 只抬 approvals）
  const alwaysForced = alwaysHit.length > 0;
  if (alwaysForced) base = 'high';

  // 4) approvals：取档位配置，always_human 只能抬高不能降低
  let approvals = tiers[base]?.approvals_required;
  if (approvals === undefined) approvals = 1;
  if (alwaysForced) {
    approvals = Math.max(approvals, alwaysHuman.approvals_required ?? 2);
  }

  // 5) hits / reasons
  const hits: GateResult['hits'] = [];
  const seenHit = new Set<string>();
  const addHit = (id: string, why: string): void => {
    if (seenHit.has(id)) return;
    seenHit.add(id);
    hits.push({ id, why });
  };

  // 命中的层级信号（按 high → medium → low 顺序，便于阅读）
  for (const tier of TIER_ORDER) {
    for (const token of byTier.get(tier) ?? []) {
      const signal = signalByToken.get(token);
      if (signal) addHit(token, signal.why);
    }
  }
  for (const token of alwaysHit) {
    addHit(token, ALWAYS_HUMAN_WHY[token] ?? '命中永远人工规则');
  }
  for (const escalation of escalations) {
    addHit(escalation.id, escalation.why);
  }

  const reasons: string[] = [];
  for (const hit of hits) {
    if (!reasons.includes(hit.why)) reasons.push(hit.why);
  }
  if (reasons.length === 0) {
    reasons.push(`未命中风险信号，按默认级别 ${base}`);
  }

  return {
    tier: base,
    approvals,
    decision: approvals === 0 ? 'auto-publish' : 'needs-human',
    reasons,
    hits,
  };
}
