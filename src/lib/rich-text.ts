const ALLOWED_TAGS = new Set([
  'p',
  'div',
  'br',
  'strong',
  'b',
  'em',
  'i',
  'u',
  'ol',
  'ul',
  'li'
]);

export function sanitizeLimitedRichText(value: unknown) {
  if (typeof value !== 'string') return '';

  let next = value
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<!--([\s\S]*?)-->/g, '');

  next = next.replace(/<\/?([a-z0-9]+)(?:\s[^>]*)?>/gi, (match, rawTag: string) => {
    const tag = String(rawTag || '').toLowerCase();
    if (!ALLOWED_TAGS.has(tag)) return '';
    const closing = /^<\//.test(match);
    if (tag === 'br') return '<br>';
    return closing ? `</${tag}>` : `<${tag}>`;
  });

  return next.trim();
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export function normalizeLegacyRichText(value: unknown) {
  const raw = String(value || '').trim();
  if (!raw) return '';

  const sanitized = sanitizeLimitedRichText(raw);
  if (/<(?:p|div|br|strong|b|em|i|u|ol|ul|li)\b/i.test(sanitized)) {
    return sanitized;
  }

  const normalized = raw
    .replace(/\\n/g, '\n')
    .replace(/\r\n?/g, '\n')
    .trim();

  const matches = Array.from(
    normalized.matchAll(/(?:^|\n)\s*(\d+)\.\s*([\s\S]*?)(?=(?:\n\s*\d+\.\s)|$)/g)
  );

  if (matches.length >= 2) {
    return (
      '<ol>' +
      matches
        .map(match => '<li>' + escapeHtml(String(match[2] || '').trim()) + '</li>')
        .join('') +
      '</ol>'
    );
  }

  return normalized
    .split('\n')
    .map(line => (line.trim() ? '<div>' + escapeHtml(line) + '</div>' : '<div><br></div>'))
    .join('');
}

export function richTextToPlainText(value: unknown) {
  return normalizeLegacyRichText(value)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>|<\/div>|<\/li>/gi, '\n')
    .replace(/<li>/gi, '• ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
