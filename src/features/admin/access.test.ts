import { describe, expect, it } from 'vitest';

import { adminAccess } from './access';

const admin = { isAdmin: true };
const member = { isAdmin: false };

describe('adminAccess', () => {
  it('waits for the session first', () => {
    expect(adminAccess({ sessionLoading: true, adminLoading: false, user: null })).toBe('loading');
    expect(adminAccess({ sessionLoading: true, adminLoading: true, user: admin })).toBe('loading');
  });

  it('sends anonymous visitors to login', () => {
    expect(adminAccess({ sessionLoading: false, adminLoading: false, user: null })).toBe('login');
  });

  it('waits for the admin flag of a signed-in user', () => {
    expect(adminAccess({ sessionLoading: false, adminLoading: true, user: member })).toBe(
      'loading',
    );
  });

  it('forbids signed-in non-admins', () => {
    expect(adminAccess({ sessionLoading: false, adminLoading: false, user: member })).toBe(
      'forbidden',
    );
  });

  it('allows admins', () => {
    expect(adminAccess({ sessionLoading: false, adminLoading: false, user: admin })).toBe(
      'allowed',
    );
  });
});
