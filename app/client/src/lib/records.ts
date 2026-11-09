import { useEffect, useState } from 'react';

/** Human label for a registry document_type. */
export function typeLabel(type: string | null | undefined): string {
  if (!type) return 'Unclassified';
  return type.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Amount with its currency, never a bare number. */
export function formatAmount(amount: number | null | undefined, currency: string | null | undefined): string {
  if (amount === null || amount === undefined) return '—';
  const value = amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return currency ? `${currency} ${value}` : value;
}

/** Semantic token classes for a processing / validation status. */
export function statusClass(status: string | null | undefined): string {
  switch (status) {
    case 'PASSED':
      return 'bg-success text-success-foreground';
    case 'NEEDS_REVIEW':
      return 'bg-warning text-warning-foreground';
    case 'EXCLUDED':
    case null:
    case undefined:
      return 'bg-muted text-muted-foreground';
    default:
      return 'bg-destructive text-destructive-foreground';
  }
}

export function statusLabel(status: string | null | undefined): string {
  return status ? status.replace(/_/g, ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase()) : 'Unknown';
}

/**
 * Path of the original file relative to the source volume, as the files plugin expects it.
 * "dbfs:/Volumes/<catalog>/<schema>/<volume>/a/b.pdf" -> "a/b.pdf"
 */
export function volumeRelativePath(path: string): string {
  return path.replace(/^(dbfs:)?\/Volumes\/[^/]+\/[^/]+\/[^/]+\/?/, '');
}

const FILES_VOLUME = 'files';

export function originalFileUrl(path: string, mode: 'raw' | 'download'): string {
  return `/api/files/${FILES_VOLUME}/${mode}?${new URLSearchParams({ path: volumeRelativePath(path) })}`;
}

export function uploadUrl(fileName: string): string {
  return `/api/files/${FILES_VOLUME}/upload?${new URLSearchParams({ path: fileName })}`;
}

export const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp']);

/**
 * Read a JSON column (arrays / maps serialised with to_json in SQL). The analytics API already
 * turns JSON-looking strings into objects, so accept either form.
 */
export function parseJson<T>(value: unknown, fallback: T): T {
  if (value === null || value === undefined || value === '') return fallback;
  if (typeof value !== 'string') return value as T;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

/** Booleans can arrive as true/false or as the strings "true"/"false". */
export function isTrue(value: unknown): boolean {
  return value === true || value === 'true';
}

/** Human-readable value for an extracted field: text, a list, or line items. */
export function formatFieldValue(value: unknown): string {
  const parsed = parseJson<unknown>(value, value);
  if (parsed === null || parsed === undefined || parsed === '') return '';
  if (Array.isArray(parsed)) {
    return parsed
      .map((item) => {
        if (item === null || typeof item !== 'object') return String(item);
        const obj = item as Record<string, unknown>;
        const name = obj.description ?? obj.name ?? obj.item_code;
        const rest = Object.entries(obj)
          .filter(([k, v]) => v !== null && v !== undefined && !['description', 'name'].includes(k))
          .map(([k, v]) => `${k.replace(/_/g, ' ')} ${v}`);
        return [name, ...rest].filter(Boolean).join(' · ');
      })
      .join('\n');
  }
  if (typeof parsed === 'object') {
    return Object.entries(parsed as Record<string, unknown>)
      .map(([k, v]) => `${k.replace(/_/g, ' ')}: ${v}`)
      .join('\n');
  }
  return String(parsed);
}

export interface WhoAmI {
  email: string | null;
  user: string | null;
}

/** The signed-in person, from the identity headers Databricks Apps inject. */
export function useWhoAmI(): WhoAmI | null {
  const [me, setMe] = useState<WhoAmI | null>(null);
  useEffect(() => {
    fetch('/api/whoami')
      .then((r) => (r.ok ? r.json() : null))
      .then(setMe)
      .catch(() => setMe(null));
  }, []);
  return me;
}
