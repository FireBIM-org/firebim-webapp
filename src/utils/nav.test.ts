import { describe, expect, it } from 'vitest';

import { isActiveRoute } from './nav';

describe('isActiveRoute', () => {
  it('matches exactly by default', () => {
    expect(isActiveRoute('/dashboard', '/dashboard')).toBe(true);
    expect(isActiveRoute('/ifc-models/[id]', '/ifc-models')).toBe(false);
  });

  it('matches nested routes with matchPrefix', () => {
    expect(isActiveRoute('/admin', '/admin', true)).toBe(true);
    expect(isActiveRoute('/admin/users', '/admin', true)).toBe(true);
    expect(isActiveRoute('/admin/users/[id]', '/admin/users', true)).toBe(true);
  });

  it('does not match a sibling that only shares the prefix', () => {
    expect(isActiveRoute('/administer', '/admin', true)).toBe(false);
    expect(isActiveRoute('/dashboard', '/admin', true)).toBe(false);
  });
});
