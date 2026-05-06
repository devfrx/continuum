const DEV_PREFIX_RE = /^\s*\[?DEV (?:ARCH|SEM) \d{12}-\d{2}\]?\s*(?:-\s*)?/i;

export function graphDisplayLabel(raw: string, maxLength = 32): string {
  const original = raw.trim();
  const readable = original.replace(DEV_PREFIX_RE, '').trim() || original || '(untitled)';
  if (readable.length <= maxLength) return readable;
  return `${readable.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...`;
}