import { describe, expect, it } from 'vitest';

import { adminAccess } from './access';

const admin = { signedIn: true, isAdmin: true };
const member = { signedIn: true, isAdmin: false };
const anonymous = { signedIn: false, isAdmin: false };

describe('adminAccess', () => {
  it('waits for the session first', () => {
    expect(adminAccess({ sessionLoading: true, adminLoading: false, ...anonymous })).toBe(
      'loading',
    );
    expect(adminAccess({ sessionLoading: true, adminLoading: true, ...admin })).toBe('loading');
  });

  it('sends anonymous visitors to login', () => {
    expect(adminAccess({ sessionLoading: false, adminLoading: false, ...anonymous })).toBe('login');
  });

  it('waits for the admin flag of a signed-in user', () => {
    expect(adminAccess({ sessionLoading: false, adminLoading: true, ...member })).toBe('loading');
  });

  it('forbids signed-in non-admins', () => {
    expect(adminAccess({ sessionLoading: false, adminLoading: false, ...member })).toBe(
      'forbidden',
    );
  });

  it('allows admins', () => {
    expect(adminAccess({ sessionLoading: false, adminLoading: false, ...admin })).toBe('allowed');
  });
});
