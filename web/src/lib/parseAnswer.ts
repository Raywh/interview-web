/**
 * 解析含 ```代码块``` 的 Markdown —— 从 interview_app/pages/detail/detail.js `parseAnswer` 移植。
 *
 * 与小程序版的差异：
 *  - 修正围栏正则：小程序版 `/```([^\n]*?)\r?\n?.../` 的 lazy + 可选换行会把语言名
 *    （如 "Plain Text"）当成代码首行、lang 永远为空。这里改为 `([^\n]*)`，语言名正确进 lang。
 *  - 去掉了渲染用的 `_k` 字段（Web 用 v-for 索引作 key）。
 *  - code 片段额外保留原始 `code` 字符串：CodeBlock 契约要求 `code` prop 用于复制；
 *    小程序版只有 tokens。tokens 拼接虽等价，但显式保留更稳。
 */
import { highlightCode, type HighlightToken } from './highlight';
import { mdToHtml } from './markdown';

export interface AnswerTextPart {
  type: 'text';
  text: string;
  html: string;
}

export interface AnswerCodePart {
  type: 'code';
  lang: string;
  code: string;
  tokens: HighlightToken[];
}

export type AnswerPart = AnswerTextPart | AnswerCodePart;

export function parseAnswer(md: string): AnswerPart[] {
  if (!md) return [];

  const parts: AnswerPart[] = [];
  // 修正点：group 1 用贪婪 [^\n]*，保证 “```Plain Text” 的语言名不会被并入 code
  const FENCE = /```([^\n]*)\r?\n?([\s\S]*?)(?:```|$)/g;
  let last = 0;
  let m: RegExpExecArray | null;

  while ((m = FENCE.exec(md)) !== null) {
    if (m.index > last) {
      const text = md.slice(last, m.index);
      parts.push({ type: 'text', text, html: mdToHtml(text) });
    }

    const lang = (m[1] ?? '').trim();
    const code = (m[2] ?? '').replace(/\n$/, '');
    parts.push({ type: 'code', lang, code, tokens: highlightCode(code) });
    last = m.index + m[0].length;
  }

  if (last < md.length) {
    const text = md.slice(last);
    parts.push({ type: 'text', text, html: mdToHtml(text) });
  }

  return parts;
}
