/** 日期格式化工具（列表 / 详情共用）。 */

function toDate(value: number | string | null | undefined): Date | null {
  if (value === null || value === undefined || value === '') return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** 时间戳 / ISO 字符串 → ISO 字符串；非法值返回空串（UiDateBlock 会回退到今天） */
export function toIsoDate(value: number | string | null | undefined): string {
  const date = toDate(value);
  return date ? date.toISOString() : '';
}

/** 详情页展示用：2026年8月15日 */
export function formatDate(value: number | string | null | undefined): string {
  const date = toDate(value);
  if (!date) return '';
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(date);
}

/** 详情页展示用：2026年8月15日 13:25 */
export function formatDateTime(value: number | string | null | undefined): string {
  const date = toDate(value);
  if (!date) return '';
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}
