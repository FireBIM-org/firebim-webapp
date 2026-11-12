import { describe, expect, it } from 'vitest';

import { isErrorToastSuppressed } from './query-meta';

describe('isErrorToastSuppressed', () => {
  it('toasts by default', () => {
    expect(isErrorToastSuppressed(new Error('x'), undefined)).toBe(false);
    expect(isErrorToastSuppressed(new Error('x'), {})).toBe(false);
    expect(isErrorToastSuppressed(new Error('x'), { suppressErrorToast: false })).toBe(false);
  });

  it('suppresses every error with true', () => {
    expect(isErrorToastSuppressed(new Error('x'), { suppressErrorToast: true })).toBe(true);
  });

  it('asks a predicate about the error', () => {
    const meta = { suppressErrorToast: (error: unknown) => (error as Error).message === 'quiet' };
    expect(isErrorToastSuppressed(new Error('quiet'), meta)).toBe(true);
    expect(isErrorToastSuppressed(new Error('loud'), meta)).toBe(false);
  });
});
