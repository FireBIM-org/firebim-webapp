import type { AdminUserSort, AdminUsersParams, SortOrder } from './api';

/**
 * State of the /admin/users table, kept in the URL (?q=&page=&sort=&order=) so a reload or the back
 * button from a user's page restores the same view.
 */
export interface UsersTableState {
  search: string;
  /** 1-based */
  page: number;
  sort: AdminUserSort;
  order: SortOrder;
}

export const USERS_PAGE_SIZE = 25;

/** The API's maxLength for GET /admin/users?search=; longer values get a 422. */
export const USERS_SEARCH_MAX_LENGTH = 200;

const SORTS: readonly AdminUserSort[] = ['created_at', 'last_seen_at', 'storage_bytes', 'username'];

export const DEFAULT_USERS_STATE: UsersTableState = {
  search: '',
  page: 1,
  sort: 'created_at',
  order: 'desc',
};

/** The order a column sorts in on its first click: names A→Z, everything else newest/largest first. */
export function defaultOrderFor(sort: AdminUserSort): SortOrder {
  return sort === 'username' ? 'asc' : 'desc';
}

type RouterQuery = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/** Read the table state from the router query; anything invalid falls back to the default. */
export function parseUsersQuery(query: RouterQuery): UsersTableState {
  const sortValue = first(query.sort);
  const sort = SORTS.includes(sortValue as AdminUserSort)
    ? (sortValue as AdminUserSort)
    : DEFAULT_USERS_STATE.sort;
  const orderValue = first(query.order);
  const order: SortOrder =
    orderValue === 'asc' || orderValue === 'desc' ? orderValue : defaultOrderFor(sort);
  const page = Number.parseInt(first(query.page) ?? '', 10);
  return {
    search: (first(query.q) ?? '').slice(0, USERS_SEARCH_MAX_LENGTH),
    page: Number.isInteger(page) && page > 0 ? page : 1,
    sort,
    order,
  };
}

/** The router query for a table state, leaving out defaults to keep URLs short. */
export function toUsersQuery(state: UsersTableState): Record<string, string> {
  const query: Record<string, string> = {};
  if (state.search.trim()) query.q = state.search.trim();
  if (state.page > 1) query.page = String(state.page);
  if (state.sort !== DEFAULT_USERS_STATE.sort) query.sort = state.sort;
  if (state.order !== defaultOrderFor(state.sort)) query.order = state.order;
  return query;
}

/** API parameters for GET /admin/users. */
export function toUsersParams(
  state: UsersTableState,
  pageSize = USERS_PAGE_SIZE,
): AdminUsersParams {
  const search = state.search.trim().slice(0, USERS_SEARCH_MAX_LENGTH);
  return {
    ...(search ? { search } : {}),
    limit: pageSize,
    offset: (state.page - 1) * pageSize,
    sort: state.sort,
    order: state.order,
  };
}

/** Clicking a column header: the same column flips the order, a new column starts at its default. */
export function nextSort(state: UsersTableState, sort: AdminUserSort): UsersTableState {
  const order =
    state.sort === sort ? (state.order === 'asc' ? 'desc' : 'asc') : defaultOrderFor(sort);
  return { ...state, sort, order, page: 1 };
}

/** Number of pages for `total` rows (at least 1, so an empty result still shows "page 1 of 1"). */
export function pageCount(total: number, pageSize = USERS_PAGE_SIZE): number {
  return Math.max(1, Math.ceil(total / pageSize));
}

/**
 * What the pagination footer shows for `page` of `total` rows. A page past the end (an old
 * bookmark, or users filtered away meanwhile) is clamped to the last page.
 */
export function pageRange(
  page: number,
  total: number,
  pageSize = USERS_PAGE_SIZE,
): { page: number; pages: number; first: number; last: number } {
  const pages = pageCount(total, pageSize);
  const current = Math.min(Math.max(1, page), pages);
  return {
    page: current,
    pages,
    first: total === 0 ? 0 : (current - 1) * pageSize + 1,
    last: Math.min(current * pageSize, total),
  };
}
