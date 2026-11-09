/**
 * 代码语法高亮 —— 从 interview_app/pages/detail/detail.js `highlightCode` 逐行移植。
 * 纯函数、无第三方依赖，正则分词 + One Dark 配色。
 */

const COLOR_DEFAULT = '#abb2bf'; // 默认文本
const COLOR_STRING = '#98c379'; // 字符串
const COLOR_COMMENT = '#7f848e'; // 注释
const COLOR_NUMBER = '#d19a66'; // 数字
const COLOR_KEYWORD = '#c678dd'; // 关键字
const COLOR_FUNC = '#61afef'; // 函数名

// 依次匹配：字符串 | 注释 | 数字 | 关键字 | 函数调用
const TOKEN_RE =
  /(`(?:[^`\\]|\\.)*`|'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*")|(\/\/[^\n]*|\/\*[\s\S]*?\*\/)|(\b\d+(?:\.\d+)?\b)|(\b(?:const|let|var|function|return|if|else|for|while|do|switch|case|break|continue|default|import|export|from|class|new|async|await|typeof|instanceof|extends|interface|type|enum|implements|public|private|protected|readonly|static|abstract|get|set|try|catch|finally|throw|void|true|false|null|undefined|this|super|yield|in|of|as|satisfies|keyof|infer|never|unknown|any|declare|namespace|module|require)\b)|([A-Za-z_$][\w$]*)(?=\s*\()/g;

export interface HighlightToken {
  text: string;
  color: string;
}

/**
 * 把代码切分为带颜色的 token 序列（保留换行，供 white-space: pre-wrap 渲染）。
 * 注意：小程序版本额外附加了 `_k` 作为 wx:key；Web 用 v-for 索引作 key，不需要该字段。
 */
export function highlightCode(code: string): HighlightToken[] {
  const tokens: HighlightToken[] = [];
  let last = 0;
  let m: RegExpExecArray | null;

  TOKEN_RE.lastIndex = 0;
  while ((m = TOKEN_RE.exec(code)) !== null) {
    if (m.index > last) {
      tokens.push({ text: code.slice(last, m.index), color: COLOR_DEFAULT });
    }

    let color = COLOR_DEFAULT;
    if (m[1]) color = COLOR_STRING;
    else if (m[2]) color = COLOR_COMMENT;
    else if (m[3]) color = COLOR_NUMBER;
    else if (m[4]) color = COLOR_KEYWORD;
    else if (m[5]) color = COLOR_FUNC;

    tokens.push({ text: m[0], color });
    last = m.index + m[0].length;
  }

  if (last < code.length) {
    tokens.push({ text: code.slice(last), color: COLOR_DEFAULT });
  }

  return tokens;
}
