const HTML_ESCAPE_MAP = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

const ALLOWED_HTML_TAGS = new Set([
  'a',
  'b',
  'blockquote',
  'br',
  'code',
  'em',
  'h1',
  'h2',
  'h3',
  'h4',
  'i',
  'li',
  'ol',
  'p',
  'pre',
  'strong',
  'u',
  'ul',
]);

const SAFE_URL_PROTOCOLS = new Set(['http:', 'https:', 'mailto:']);

export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => HTML_ESCAPE_MAP[char]);
}

export function escapeHtmlWithLineBreaks(value) {
  return escapeHtml(value).replace(/\r\n|\r|\n/g, '<br>');
}

export function sanitizeEmailSubject(value, fallback = 'Occasio notification') {
  const normalized = String(value ?? '').replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim();
  return normalized || fallback;
}

function sanitizeAnchorHref(rawAttributes = '') {
  const match = rawAttributes.match(/\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i);
  const rawHref = match?.[1] ?? match?.[2] ?? match?.[3];
  if (!rawHref) return '';

  try {
    const url = new URL(rawHref, 'https://occasio.local');
    if (!SAFE_URL_PROTOCOLS.has(url.protocol)) return '';
    return ` href="${escapeHtml(rawHref)}" target="_blank" rel="noopener noreferrer"`;
  } catch {
    return '';
  }
}

export function sanitizeBasicHtml(value) {
  const input = String(value ?? '');
  const tagPattern = /<\/?([a-z][a-z0-9-]*)(\s[^>]*)?>/gi;
  let output = '';
  let lastIndex = 0;
  let match;

  while ((match = tagPattern.exec(input)) !== null) {
    output += escapeHtml(input.slice(lastIndex, match.index));

    const [rawTag, tagName, attributes = ''] = match;
    const tag = tagName.toLowerCase();
    if (!ALLOWED_HTML_TAGS.has(tag)) {
      lastIndex = tagPattern.lastIndex;
      continue;
    }

    const isClosingTag = /^<\//.test(rawTag);
    if (isClosingTag) {
      output += tag === 'br' ? '' : `</${tag}>`;
      lastIndex = tagPattern.lastIndex;
      continue;
    }

    if (tag === 'br') output += '<br>';
    else if (tag === 'a') output += `<a${sanitizeAnchorHref(attributes)}>`;
    else output += `<${tag}>`;

    lastIndex = tagPattern.lastIndex;
  }

  output += escapeHtml(input.slice(lastIndex));
  return output;
}
