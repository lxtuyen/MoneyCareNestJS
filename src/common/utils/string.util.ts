import { createHash } from 'crypto';

export function norm(value: string): string {
  return (value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

export function coerceString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export function buildIntentHash(message: string): string {
  const normalized = norm(message).replace(/\s+/g, ' ');
  return createHash('md5').update(normalized).digest('hex').slice(0, 8);
}
