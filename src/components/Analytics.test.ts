import { describe, expect, it } from 'vitest';

import { isAnalyticsConfigured } from './Analytics';

describe('isAnalyticsConfigured', () => {
  it('is false for missing, empty and placeholder IDs', () => {
    expect(isAnalyticsConfigured(undefined)).toBe(false);
    expect(isAnalyticsConfigured('')).toBe(false);
    expect(isAnalyticsConfigured('   ')).toBe(false);
    expect(isAnalyticsConfigured('change-me-ignore-local-XXXX-XXXX-XXXXXXXXXXXX')).toBe(false);
    expect(isAnalyticsConfigured('CHANGE-ME-IGNORE-LOCAL-1')).toBe(false);
  });

  it('is true for a real website ID', () => {
    expect(isAnalyticsConfigured('3f1c9a52-8a3e-4d1e-9c7b-0d2b6f1e2a11')).toBe(true);
  });
});
