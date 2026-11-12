/**
 * `meta.suppressErrorToast` on a query opts it out of the global error toast in QueryProvider:
 * `true` for background lookups (e.g. ['me']), or a predicate for errors the page reports inline
 * (e.g. a 404 on a detail page).
 */
export type SuppressErrorToast = boolean | ((error: unknown) => boolean);

declare module '@tanstack/react-query' {
  interface Register {
    queryMeta: { suppressErrorToast?: SuppressErrorToast };
  }
}

export function isErrorToastSuppressed(
  error: unknown,
  meta: { suppressErrorToast?: SuppressErrorToast } | undefined,
): boolean {
  const suppress = meta?.suppressErrorToast;
  return typeof suppress === 'function' ? suppress(error) : suppress === true;
}
