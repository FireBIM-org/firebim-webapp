/** Formatting helpers for the admin dashboard. All output is English, matching the rest of the app. */

const EMPTY = '—';
const BYTE_UNITS = ['B', 'KiB', 'MiB', 'GiB', 'TiB', 'PiB'] as const;

const numberFormat = new Intl.NumberFormat('en-US');
const percentFormat = new Intl.NumberFormat('en-US', {
  style: 'percent',
  maximumFractionDigits: 1,
});
const relativeFormat = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });

/** Bytes in binary units: `0 B`, `512 B`, `1.5 KiB`, `931.3 GiB`. A trailing `.0` is dropped. */
export function formatBytes(bytes: number | null | undefined, fractionDigits = 1): string {
  if (bytes == null || !Number.isFinite(bytes) || bytes < 0) return EMPTY;
  if (bytes < 1024) return `${Math.round(bytes)} B`;

  let unit = Math.min(Math.floor(Math.log2(bytes) / 10), BYTE_UNITS.length - 1);
  let rounded = Number((bytes / 1024 ** unit).toFixed(fractionDigits));
  // 1023.96 KiB rounds to 1024.0 KiB: show it as 1 MiB instead.
  if (rounded >= 1024 && unit < BYTE_UNITS.length - 1) {
    unit += 1;
    rounded = Number((bytes / 1024 ** unit).toFixed(fractionDigits));
  }
  return `${rounded} ${BYTE_UNITS[unit]}`;
}

/** Grouped integer/decimal: `1,234,567`. */
export function formatNumber(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return EMPTY;
  return numberFormat.format(value);
}

/** A 0..1 ratio as a percentage with at most one decimal: `0.4251` → `42.5%`. */
export function formatPercent(ratio: number | null | undefined): string {
  if (ratio == null || !Number.isFinite(ratio)) return EMPTY;
  return percentFormat.format(ratio);
}

const RELATIVE_STEPS: Array<[Intl.RelativeTimeFormatUnit, number]> = [
  ['second', 60],
  ['minute', 60],
  ['hour', 24],
  ['day', 30],
  ['month', 12],
  ['year', Number.POSITIVE_INFINITY],
];

/**
 * `just now`, `5 minutes ago`, `yesterday`, `3 months ago`; `Never` for null.
 * `now` is injectable so callers (and tests) get stable output.
 */
export function formatRelativeTime(
  iso: string | null | undefined,
  now: number = Date.now(),
): string {
  if (iso == null) return 'Never';
  const time = Date.parse(iso);
  if (Number.isNaN(time)) return EMPTY;

  let value = (time - now) / 1000;
  if (Math.abs(value) < 45) return 'just now';
  for (const [unit, size] of RELATIVE_STEPS) {
    // Compare the rounded value so 59.6 minutes reads "1 hour ago", not "60 minutes ago".
    const rounded = Math.round(value);
    if (Math.abs(rounded) < size) return relativeFormat.format(rounded, unit);
    value /= size;
  }
  return EMPTY;
}

/** Absolute local date and time, as used elsewhere in the app; `—` for null or invalid input. */
export function formatDateTime(iso: string | null | undefined): string {
  if (iso == null) return EMPTY;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return EMPTY;
  return `${date.toLocaleDateString()} ${date.toLocaleTimeString()}`;
}

export type UsageLevel = 'ok' | 'warning' | 'critical';

/** `critical` at or above the limit, `warning` at or above `warnRatio`, otherwise `ok`. */
export function usageLevel(ratio: number, warnRatio: number): UsageLevel {
  if (ratio >= 1) return 'critical';
  if (warnRatio > 0 && ratio >= warnRatio) return 'warning';
  return 'ok';
}
