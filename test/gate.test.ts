/**
 * 门禁测试（零依赖，node:test）
 *
 * 运行：node --test test/gate.test.ts
 * 直接 import TypeScript 源码，靠 Node 24 内置的类型擦除（不需要 ts-node / tsx）。
 *
 * 判定语义移植自 D:\deep-harness\review-gate\scripts\review.mjs 的
 * classify / raiseTier / matchPath，测试用例对照该语义写。
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  evaluate,
  extractSignals,
  matchPath,
  raiseTier,
  RISK_CONFIG,
  TIER_ORDER,
} from '../api/src/moderation/gate.ts';

/** 真实配置去掉内容升级器：用来单独验证 tiers 分级 */
const NO_ESCALATORS = { ...RISK_CONFIG, content_escalators: [] };

test('纯文本 → low（无信号、按 default_tier）', () => {
  const gate = evaluate('Vue 的响应式原理是什么？ref 和 reactive 有什么区别？');
  assert.equal(gate.tier, 'low');
  assert.equal(gate.approvals, 1);
  assert.equal(gate.decision, 'needs-human');
  assert.deepEqual(gate.hits, []);
  assert.deepEqual(gate.reasons, ['未命中风险信号，按默认级别 low']);
});

test('带链接 → medium（low 经 extlink raise 升一级，见 docs/api.md §8.8）', () => {
  // 真配置：has:link 不在 tiers 里，靠 extlink 的 raise 把 low 抬到 medium
  const real = evaluate('参考 https://vuejs.org/guide 这篇文档');
  assert.equal(real.tier, 'medium');
  assert.equal(real.approvals, 1);
  assert.equal(real.decision, 'needs-human');
  assert.deepEqual(real.reasons, ['含外链']);
  assert.ok(real.hits.some((hit) => hit.id === 'has:link'));
  assert.ok(real.hits.some((hit) => hit.id === 'extlink'));
  // 防回归（docs/api.md §8.8）：同一个事实不在 tiers 和 escalators 里各算一次
  assert.ok(!(RISK_CONFIG.tiers?.medium?.match ?? []).includes('has:link'));

  // 去掉升级器的副本：链接不参与 tiers 分级，回落 default_tier → low
  // 证明 medium 是 escalator 抬上来的，不是 tiers 直接命中
  const pure = evaluate('参考 https://vuejs.org/guide 这篇文档', NO_ESCALATORS);
  assert.equal(pure.tier, 'low');
  assert.ok(pure.hits.some((hit) => hit.id === 'has:link'));
});

test('代码块 + 链接 → high（medium 经 raise 再升一级）', () => {
  const gate = evaluate('```js\n// 参考 https://vuejs.org/guide\nconst a = 1;\n```');
  assert.equal(gate.tier, 'high');
  assert.equal(gate.approvals, 2);
  assert.ok(gate.hits.some((hit) => hit.id === 'has:code'));
  assert.ok(gate.hits.some((hit) => hit.id === 'extlink'));
  assert.ok(gate.reasons.includes('含代码块'));
  assert.ok(gate.reasons.includes('含外链'));
});

test('带代码块（``` 围栏）→ medium', () => {
  const gate = evaluate('```js\nconst a = 1;\n```');
  assert.equal(gate.tier, 'medium');
  assert.ok(gate.hits.some((hit) => hit.id === 'has:code'));
  assert.ok(gate.reasons.includes('含代码块'));
});

test('带代码块（4 空格缩进）→ medium', () => {
  const gate = evaluate('示例：\n    const a = 1;\n');
  assert.equal(gate.tier, 'medium');
  assert.ok(gate.reasons.includes('含代码块'));
});

test('带手机号 → high（forced-high 升级器 + has:contact）', () => {
  const gate = evaluate('有问题加我 13812345678 聊');
  assert.equal(gate.tier, 'high');
  assert.equal(gate.approvals, 2);
  assert.equal(gate.decision, 'needs-human');
  assert.ok(gate.reasons.includes('疑似手机号'));
  assert.ok(gate.hits.some((hit) => hit.id === 'has:contact'));
  assert.ok(gate.hits.some((hit) => hit.id === 'phone'));
});

test('带邮箱 → high', () => {
  const gate = evaluate('可以把简历发到 someone@example.com');
  assert.equal(gate.tier, 'high');
  assert.equal(gate.approvals, 2);
  assert.ok(gate.reasons.includes('疑似邮箱'));
  assert.ok(gate.hits.some((hit) => hit.id === 'email'));
});

test('完整 script 块 → 升一级（raise），不是 forced-high', () => {
  // 2026-11-06 调整：原先只要出现 `<script` 就判 high，
  // 但 Vue 面试题几乎都会写 `<script setup>`，导致 AI 回答被误判。
  // 现在只匹配「完整闭合的 script 块」，且降为 raise。
  const gate = evaluate('<script>alert(1)</script>');
  assert.equal(gate.tier, 'medium');
  assert.ok(gate.hits.some((hit) => hit.id === 'script'));
});

test('Vue 的 <script setup> 不应被误判', () => {
  const gate = evaluate('使用 <script setup> 语法糖时，无需 return 暴露属性。');
  assert.equal(gate.tier, 'low');
  assert.ok(!gate.hits.some((hit) => hit.id === 'script'));
});

test('带微信号 → high', () => {
  const gate = evaluate('加我微信：abcde12345 详聊');
  assert.equal(gate.tier, 'high');
  assert.ok(gate.reasons.includes('疑似微信号'));
});

test('图片 → always_human(high)，approvals ≥ 2', () => {
  const gate = evaluate('![](https://cdn.example.com/a.png)');
  assert.equal(gate.tier, 'high');
  assert.equal(gate.approvals, 2);
  assert.equal(gate.decision, 'needs-human');
  // has:image 走 tiers 的 high；always:image 走 always_human
  assert.ok(gate.hits.some((hit) => hit.id === 'has:image'));
  assert.ok(gate.hits.some((hit) => hit.id === 'always:image'));
  assert.ok(gate.reasons.includes('含图片'));
});

test('超长正文（> 5000 字）→ medium', () => {
  const gate = evaluate('面'.repeat(5001));
  assert.equal(gate.tier, 'medium');
  assert.ok(gate.hits.some((hit) => hit.id === 'len:long'));
  assert.ok(gate.reasons.includes('正文超长（超过 5000 字）'));
});

test('空内容 → low（不抛异常、也不误判）', () => {
  const empty = evaluate({ content: '' });
  assert.equal(empty.tier, 'low');
  assert.equal(empty.decision, 'needs-human');
  assert.deepEqual(empty.hits, []);

  const blank = evaluate({ title: '', content: '', analysis: '' });
  assert.equal(blank.tier, 'low');
});

test('forced-high 与 raise 同时命中 → high（forced-high 永远赢）', () => {
  const content = '联系 13812345678，详情见 https://example.com/a';
  const gate = evaluate(content);
  assert.equal(gate.tier, 'high');
  assert.ok(gate.reasons.includes('疑似手机号'));
  assert.ok(gate.reasons.includes('含外链'));
});

test('升级器顺序无关：raise 在前 / high 在后，结论都是 high', () => {
  const baseRisk = {
    tiers: {
      high: { approvals_required: 2, match: ['has:contact'] },
      medium: { approvals_required: 1, match: ['has:code'] },
      low: { approvals_required: 1, match: ['*'] },
    },
    default_tier: 'low',
    always_human: { approvals_required: 2, paths: ['always:image', 'always:sensitive'] },
  };
  const raiseRule = { id: 'extlink', pattern: 'https?://', effect: 'raise', why: '含外链' };
  const highRule = { id: 'phone', pattern: '1[3-9]\\d{9}', effect: 'high', why: '疑似手机号' };
  const content = '```\n代码\n```\nhttps://example.com 13812345678';

  const raiseFirst = evaluate(content, { ...baseRisk, content_escalators: [raiseRule, highRule] });
  const highFirst = evaluate(content, { ...baseRisk, content_escalators: [highRule, raiseRule] });

  assert.equal(raiseFirst.tier, 'high');
  assert.equal(highFirst.tier, 'high');
  assert.deepEqual(
    raiseFirst.hits.map((hit) => hit.id).sort(),
    highFirst.hits.map((hit) => hit.id).sort(),
  );
});

test('approvals 与 decision 对应：0 → auto-publish，≥1 → needs-human', () => {
  const autoRisk = {
    tiers: {
      high: { approvals_required: 2, match: ['has:contact'] },
      medium: { approvals_required: 1, match: ['has:code'] },
      low: { approvals_required: 0, match: ['*'] },
    },
    default_tier: 'low',
    always_human: { approvals_required: 2, paths: ['always:image', 'always:sensitive'] },
    content_escalators: [],
  };

  const auto = evaluate('普通内容，没有任何信号', autoRisk);
  assert.equal(auto.tier, 'low');
  assert.equal(auto.approvals, 0);
  assert.equal(auto.decision, 'auto-publish');

  // 真实配置下 low 也要 1 人，所以永远不会自动发布（docs/api.md §2 的预期）
  const real = evaluate('普通内容，没有任何信号');
  assert.equal(real.approvals, 1);
  assert.equal(real.decision, 'needs-human');
});

test('中文内容不被误判（无外链 / 无联系方式 / 无代码）', () => {
  const gate = evaluate(
    '这道题考察闭包与作用域，请说明 var 和 let 的差异，以及暂时性死区（TDZ）的含义。',
  );
  assert.equal(gate.tier, 'low');
  assert.equal(gate.approvals, 1);
  assert.deepEqual(gate.hits, []);
  for (const reason of gate.reasons) {
    assert.ok(!reason.includes('手机号'));
    assert.ok(!reason.includes('邮箱'));
    assert.ok(!reason.includes('外链'));
  }
});

test('信号抽取：五类信号都能识别', () => {
  const signals = extractSignals({
    title: '标题',
    content: '看 https://example.com 和 13812345678',
    analysis: '```\ncode\n```\n![](a.png)\n' + '字'.repeat(5001),
  });
  const tokens = signals.map((signal) => signal.token);
  assert.deepEqual(tokens.sort(), ['has:code', 'has:contact', 'has:image', 'has:link', 'len:long']);
});

test('raiseTier / matchPath 语义与 review-gate 一致', () => {
  assert.equal(raiseTier('low'), 'medium');
  assert.equal(raiseTier('medium'), 'high');
  assert.equal(raiseTier('high'), 'high');

  // 配置里 always:image 与 has:image 是两个字面量，不互相命中
  assert.equal(matchPath('has:image', 'always:image'), false);
  assert.equal(matchPath('always:image', 'always:image'), true);
  // low.match = ["*"] 是兜底，但不跨 '/'
  assert.equal(matchPath('has:link', '*'), true);
  assert.equal(matchPath('a/b', '*'), false);
  assert.equal(matchPath('a/b', '**'), true);

  assert.deepEqual([...TIER_ORDER], ['high', 'medium', 'low']);
});
