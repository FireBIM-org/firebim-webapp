/**
 * What an admin page should do for the current auth state:
 * - `loading`: the session or the GET /users/me admin flag is still unknown; render nothing sensitive.
 * - `login`: not signed in (useRequireAuth redirects to /login).
 * - `forbidden`: signed in but not an admin; redirect to /dashboard.
 * - `allowed`: render the page.
 *
 * The flag only hides UI; the API enforces admin on every /admin route.
 */
export type AdminAccess = 'loading' | 'login' | 'forbidden' | 'allowed';

export function adminAccess(state: {
  sessionLoading: boolean;
  adminLoading: boolean;
  user: { isAdmin: boolean } | null;
}): AdminAccess {
  if (state.sessionLoading) return 'loading';
  if (!state.user) return 'login';
  if (state.adminLoading) return 'loading';
  return state.user.isAdmin ? 'allowed' : 'forbidden';
}
