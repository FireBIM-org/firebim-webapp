import { describe, expect, it } from 'vitest';

import {
  formatBytes,
  formatDateTime,
  formatNumber,
  formatPercent,
  formatRelativeTime,
  usageLevel,
} from './format';

describe('formatBytes', () => {
  it('uses binary units and drops a trailing .0', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(1023)).toBe('1023 B');
    expect(formatBytes(1024)).toBe('1 KiB');
    expect(formatBytes(1536)).toBe('1.5 KiB');
    expect(formatBytes(500 * 1024 ** 2)).toBe('500 MiB');
    expect(formatBytes(3 * 1024 ** 4)).toBe('3 TiB');
  });

  it('shows the 1 TB storage limit in GiB', () => {
    expect(formatBytes(1_000_000_000_000)).toBe('931.3 GiB');
  });

  it('moves to the next unit when rounding reaches 1024', () => {
    expect(formatBytes(1024 * 1024 - 1)).toBe('1 MiB');
  });

  it('honours fractionDigits', () => {
    expect(formatBytes(1_000_000_000_000, 2)).toBe('931.32 GiB');
    expect(formatBytes(1536, 0)).toBe('2 KiB');
  });

  it('caps at PiB', () => {
    expect(formatBytes(2048 * 1024 ** 5)).toBe('2048 PiB');
  });

  it('returns a dash for missing or invalid input', () => {
    expect(formatBytes(null)).toBe('—');
    expect(formatBytes(undefined)).toBe('—');
    expect(formatBytes(Number.NaN)).toBe('—');
    expect(formatBytes(-1)).toBe('—');
  });
});

describe('formatNumber', () => {
  it('groups thousands', () => {
    expect(formatNumber(0)).toBe('0');
    expect(formatNumber(1234567)).toBe('1,234,567');
  });

  it('returns a dash for missing input', () => {
    expect(formatNumber(null)).toBe('—');
    expect(formatNumber(Number.POSITIVE_INFINITY)).toBe('—');
  });
});

describe('formatPercent', () => {
  it('formats a ratio with at most one decimal', () => {
    expect(formatPercent(0)).toBe('0%');
    expect(formatPercent(0.4251)).toBe('42.5%');
    expect(formatPercent(0.8)).toBe('80%');
    expect(formatPercent(1.2)).toBe('120%');
  });

  it('returns a dash for missing input', () => {
    expect(formatPercent(undefined)).toBe('—');
  });
});

describe('formatRelativeTime', () => {
  const now = Date.parse('2026-11-12T12:00:00Z');
  const ago = (seconds: number) => new Date(now - seconds * 1000).toISOString();

  it('says Never for null', () => {
    expect(formatRelativeTime(null, now)).toBe('Never');
  });

  it('says just now within 45 seconds either way', () => {
    expect(formatRelativeTime(ago(0), now)).toBe('just now');
    expect(formatRelativeTime(ago(44), now)).toBe('just now');
    expect(formatRelativeTime(ago(-30), now)).toBe('just now');
  });

  it('picks the largest fitting unit', () => {
    expect(formatRelativeTime(ago(50), now)).toBe('50 seconds ago');
    expect(formatRelativeTime(ago(5 * 60), now)).toBe('5 minutes ago');
    expect(formatRelativeTime(ago(3 * 3600), now)).toBe('3 hours ago');
    expect(formatRelativeTime(ago(24 * 3600), now)).toBe('yesterday');
    expect(formatRelativeTime(ago(10 * 86400), now)).toBe('10 days ago');
    expect(formatRelativeTime(ago(90 * 86400), now)).toBe('3 months ago');
    expect(formatRelativeTime(ago(800 * 86400), now)).toBe('2 years ago');
  });

  it('rolls over to the next unit when rounding reaches its size', () => {
    expect(formatRelativeTime(ago(59.6 * 60), now)).toBe('1 hour ago');
  });

  it('handles future times (clock skew)', () => {
    expect(formatRelativeTime(ago(-2 * 3600), now)).toBe('in 2 hours');
  });

  it('returns a dash for an invalid date', () => {
    expect(formatRelativeTime('not a date', now)).toBe('—');
  });
});

describe('formatDateTime', () => {
  it('returns a dash for missing or invalid input', () => {
    expect(formatDateTime(null)).toBe('—');
    expect(formatDateTime('nope')).toBe('—');
  });

  it('formats a valid timestamp', () => {
    expect(formatDateTime('2026-11-12T12:00:00Z')).not.toBe('—');
  });
});

describe('usageLevel', () => {
  it('is ok below the warning ratio', () => {
    expect(usageLevel(0, 0.8)).toBe('ok');
    expect(usageLevel(0.79, 0.8)).toBe('ok');
  });

  it('warns from the warning ratio up to the limit', () => {
    expect(usageLevel(0.8, 0.8)).toBe('warning');
    expect(usageLevel(0.99, 0.8)).toBe('warning');
  });

  it('is critical at or above the limit', () => {
    expect(usageLevel(1, 0.8)).toBe('critical');
    expect(usageLevel(1.5, 0.8)).toBe('critical');
  });

  it('ignores a disabled (zero) warning ratio', () => {
    expect(usageLevel(0.95, 0)).toBe('ok');
  });
});
