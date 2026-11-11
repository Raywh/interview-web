/**
 * 极简 Markdown → HTML —— 从 interview_app/pages/detail/detail.js `mdToHtml` 逐行移植。
 *
 * 与小程序版差异（Web 适配）：
 *  - 小程序 rich-text 内部节点不继承页面样式，所以原实现把字号/行距/颜色内联在标签上。
 *    Web 的 v-html 内容会继承页面样式，改为输出 class（样式见 styles/markdown.css），
 *    正则、分支与断行规则保持原样。
 *  - 颜色仍取自 tokens.css，值与小程序内联的 --color-text-2 / --color-text-1 /
 *    --color-surface-muted / --color-primary-pressed 完全一致。
 *  - 不加内联 style 的另一个原因：内联的 calc(... * N) 里的 `*` 会被随后的斜体正则误当成
 *    斜体标记（小程序版内联样式里没有 `*`，所以没暴露这个问题）。
 */

const MD_P = 'md-p';
const MD_LI = 'md-li';
const MD_LIST = 'md-list';
const MD_CODE = 'md-code';
const MD_H = 'md-h';
const MD_IMG = 'md-img';

/**
 * 把纯文本片段中的简单 Markdown 转为 HTML（加粗/斜体/行内代码/标题/列表/分段）。
 * 返回值由调用方通过 v-html 注入；输入里的 & < > 会先转义。
 */
export function mdToHtml(md: string): string {
  if (!md) return '';

  let s = md
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\r\n/g, '\n');

  // 行内代码
  s = s.replace(/`([^`\n]+)`/g, '<code class="' + MD_CODE + '">$1</code>');
  // 图片：只接受站内上传路径（/api/files/...），外链图片一律原样保留，避免被当成追踪像素
  s = s.replace(
    /!\[([^\]\n]*)\]\((\/api\/files\/[^)\s]+)\)/g,
    (_m, alt: string, src: string) =>
      '<img class="' + MD_IMG + '" src="' + src + '" alt="' +
      String(alt).replace(/"/g, '&quot;') + '" loading="lazy" />',
  );
  // 加粗
  s = s.replace(/\*\*([^*\n]+)\*\*/g, '<b>$1</b>');
  // 斜体
  s = s.replace(/\*([^*\n]+)\*/g, '<i>$1</i>');
  // 标题行（# 开头，[ \t] 避免吞掉后续换行）
  s = s.replace(/^#{1,6}[ \t]*(.+?)[ \t]*#*[ \t]*$/gm, '<b class="' + MD_H + '">$1</b>');
  // 句末标点后的“编号 / 圆点”断行（含无空格粘连的 -Vue 这类）
  s = s.replace(/([。；;！？）)])\s*(?=- |-\S|\d+[.、]\s)/g, '$1\n');
  // 中文后空格 + 编号也断行（如“压缩 2. 离线”）
  s = s.replace(/([\u4e00-\u9fa5])\s+(?=\d+[.、]\s)/g, '$1\n');

  // 逐行构建：连续列表行 -> <ul>/<ol>，其余 -> <p>
  const lines = s.split('\n');
  const blocks: string[] = [];
  const push = (html: string): void => {
    if (html && html.trim()) blocks.push(html.trim());
  };

  let i = 0;
  const isBullet = (t: string): boolean => /^[-*+]\s*\S/.test(t);
  const isNumbered = (t: string): boolean => /^\d+[.、]\s/.test(t) || /^\d+、/.test(t);
  const stripMarker = (t: string): string =>
    t.replace(/^[-*+]\s*/, '').replace(/^\d+[.、]\s*/, '');

  while (i < lines.length) {
    const t = (lines[i] ?? '').trim();
    if (isBullet(t) || isNumbered(t)) {
      const ordered = isNumbered(t);
      const items: string[] = [];
      while (i < lines.length) {
        const lt = (lines[i] ?? '').trim();
        if (ordered ? isNumbered(lt) : isBullet(lt)) {
          items.push(stripMarker(lt));
          i++;
        } else {
          break;
        }
      }
      const tag = ordered ? 'ol' : 'ul';
      push(
        '<' +
          tag +
          ' class="' +
          MD_LIST +
          '">' +
          items.map((it) => '<li class="' + MD_LI + '">' + it + '</li>').join('') +
          '</' +
          tag +
          '>',
      );
    } else if (t === '') {
      i++;
    } else {
      const buf: string[] = [];
      while (
        i < lines.length &&
        (lines[i] ?? '').trim() !== '' &&
        !isBullet((lines[i] ?? '').trim()) &&
        !isNumbered((lines[i] ?? '').trim())
      ) {
        buf.push(lines[i] ?? '');
        i++;
      }
      push('<p class="' + MD_P + '">' + buf.join('<br/>') + '</p>');
    }
  }

  return blocks.join('');
}
