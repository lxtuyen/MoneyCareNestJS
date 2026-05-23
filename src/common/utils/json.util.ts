import JSON5 from 'json5';

export function safeJsonParse<T>(value: unknown, fallback: T): T {
  if (typeof value !== 'string' || !value.trim()) return fallback;
  try {
    return JSON5.parse(value);
  } catch {
    return fallback;
  }
}

export function stripJsonFence(value: string): string {
  let raw = value.trim();
  if (raw.startsWith('```')) {
    raw = raw
      .replace(/```[\w]*\n?/g, '')
      .replace(/```$/, '')
      .trim();
  }
  return raw;
}

export function extractJsonObject(value: string): Record<string, unknown> {
  const raw = stripJsonFence(value || '');

  try {
    const parsed: unknown = JSON5.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    if (start < 0 || end <= start) return {};
    try {
      const parsed: unknown = JSON5.parse(raw.slice(start, end + 1));
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : {};
    } catch {
      return {};
    }
  }
}
