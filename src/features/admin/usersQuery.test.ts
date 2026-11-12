import { describe, expect, it } from 'vitest';

import {
  DEFAULT_USERS_STATE,
  USERS_SEARCH_MAX_LENGTH,
  nextSort,
  pageCount,
  pageRange,
  parseUsersQuery,
  toUsersParams,
  toUsersQuery,
} from './usersQuery';

describe('parseUsersQuery', () => {
  it('falls back to the defaults', () => {
    expect(parseUsersQuery({})).toEqual(DEFAULT_USERS_STATE);
  });

  it('reads valid values', () => {
    expect(parseUsersQuery({ q: 'anna', page: '3', sort: 'storage_bytes', order: 'asc' })).toEqual({
      search: 'anna',
      page: 3,
      sort: 'storage_bytes',
      order: 'asc',
    });
  });

  it('ignores invalid values', () => {
    expect(parseUsersQuery({ page: '-2', sort: 'password', order: 'sideways' })).toEqual(
      DEFAULT_USERS_STATE,
    );
    expect(parseUsersQuery({ page: 'abc' }).page).toBe(1);
  });

  it('takes the first of repeated parameters', () => {
    expect(parseUsersQuery({ q: ['a', 'b'] }).search).toBe('a');
  });

  it('defaults the order to the column default', () => {
    expect(parseUsersQuery({ sort: 'username' }).order).toBe('asc');
    expect(parseUsersQuery({ sort: 'last_seen_at' }).order).toBe('desc');
  });
});

describe('search length', () => {
  it('clamps a long search to the API maxLength', () => {
    const long = 'a'.repeat(USERS_SEARCH_MAX_LENGTH + 50);
    expect(parseUsersQuery({ q: long }).search).toHaveLength(USERS_SEARCH_MAX_LENGTH);
    expect(toUsersParams({ ...DEFAULT_USERS_STATE, search: ` ${long} ` }).search).toHaveLength(
      USERS_SEARCH_MAX_LENGTH,
    );
  });
});

describe('toUsersQuery', () => {
  it('omits defaults', () => {
    expect(toUsersQuery(DEFAULT_USERS_STATE)).toEqual({});
    expect(toUsersQuery({ ...DEFAULT_USERS_STATE, sort: 'username', order: 'asc' })).toEqual({
      sort: 'username',
    });
  });

  it('round-trips through parseUsersQuery', () => {
    const state = { search: 'x', page: 2, sort: 'username' as const, order: 'desc' as const };
    expect(parseUsersQuery(toUsersQuery(state))).toEqual(state);
  });

  it('trims the search and drops a blank one', () => {
    expect(toUsersQuery({ ...DEFAULT_USERS_STATE, search: '  bob ' })).toEqual({ q: 'bob' });
    expect(toUsersQuery({ ...DEFAULT_USERS_STATE, search: '   ' })).toEqual({});
  });
});

describe('toUsersParams', () => {
  it('maps page to offset', () => {
    expect(toUsersParams({ ...DEFAULT_USERS_STATE, page: 3 }, 25)).toEqual({
      limit: 25,
      offset: 50,
      sort: 'created_at',
      order: 'desc',
    });
  });

  it('includes a trimmed search only when set', () => {
    expect(toUsersParams({ ...DEFAULT_USERS_STATE, search: ' eve ' }).search).toBe('eve');
    expect('search' in toUsersParams(DEFAULT_USERS_STATE)).toBe(false);
  });
});

describe('nextSort', () => {
  it('flips the order of the current column and resets the page', () => {
    expect(nextSort({ ...DEFAULT_USERS_STATE, page: 4 }, 'created_at')).toEqual({
      ...DEFAULT_USERS_STATE,
      order: 'asc',
      page: 1,
    });
  });

  it('starts a new column at its default order', () => {
    expect(nextSort(DEFAULT_USERS_STATE, 'username')).toMatchObject({
      sort: 'username',
      order: 'asc',
    });
    expect(nextSort(DEFAULT_USERS_STATE, 'storage_bytes')).toMatchObject({
      sort: 'storage_bytes',
      order: 'desc',
    });
  });
});

describe('pageCount', () => {
  it('is at least one', () => {
    expect(pageCount(0, 25)).toBe(1);
    expect(pageCount(25, 25)).toBe(1);
    expect(pageCount(26, 25)).toBe(2);
  });
});

describe('pageRange', () => {
  it('shows the rows of the current page', () => {
    expect(pageRange(1, 60, 25)).toEqual({ page: 1, pages: 3, first: 1, last: 25 });
    expect(pageRange(3, 60, 25)).toEqual({ page: 3, pages: 3, first: 51, last: 60 });
  });

  it('shows no rows for an empty result', () => {
    expect(pageRange(1, 0, 25)).toEqual({ page: 1, pages: 1, first: 0, last: 0 });
  });

  it('clamps a page past the end to the last page', () => {
    expect(pageRange(99, 25, 25)).toEqual({ page: 1, pages: 1, first: 1, last: 25 });
    expect(pageRange(99, 0, 25)).toEqual({ page: 1, pages: 1, first: 0, last: 0 });
  });
});
