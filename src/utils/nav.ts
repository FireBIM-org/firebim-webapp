/**
 * Whether a nav link is the current page. With `matchPrefix`, nested routes count too
 * (`/admin/users/[id]` activates `/admin`), but a sibling with a shared prefix does not (`/administer`).
 */
export function isActiveRoute(pathname: string, href: string, matchPrefix = false): boolean {
  if (pathname === href) return true;
  return matchPrefix && pathname.startsWith(href.endsWith('/') ? href : `${href}/`);
}
