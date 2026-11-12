/**
 * 从模型输出里抠出 JSON —— 供「AI 出题」和「AI 解答」共用。
 *
 * 背景：R1 / Qwen 的思考过程里也会出现花括号，用「首个 { 到末个 }」截取
 * 会把思考内容当成 JSON，解析必然失败（实测 11-10 只成功 2/5）。
 * 这里改为：从每个 `{` 起点做括号配对（跳过字符串内的括号），
 * 解析成功且包含指定字段才算数。
 */

/** 取从 start 处的 `{` 开始、括号配对的子串（跳过字符串内的括号） */
function balancedObject(text: string, start: number): string | null {
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < text.length; i += 1) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === '{') depth += 1;
    else if (ch === '}') {
      depth -= 1;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

/**
 * @param requiredKey 解析结果里必须存在的字段名（用来排除「思考过程里的小对象」）
 */
export function extractJsonObject(
  text: string,
  requiredKey: string,
): Record<string, unknown> | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/)?.[1];
  const candidates = [fenced, text].filter(
    (value): value is string => typeof value === 'string' && value.length > 0,
  );

  for (const candidate of candidates) {
    for (let i = candidate.indexOf('{'); i !== -1; i = candidate.indexOf('{', i + 1)) {
      const snippet = balancedObject(candidate, i);
      if (!snippet) continue;
      try {
        const parsed = JSON.parse(snippet) as Record<string, unknown>;
        if (parsed && requiredKey in parsed) return parsed;
      } catch {
        // 继续试下一个 {
      }
    }
  }
  return null;
}
