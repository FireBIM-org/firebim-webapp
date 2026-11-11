// @vitest-environment happy-dom
import { cleanup, render, waitFor } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import RuleBookPage from '@/pages/rulebook';

import { useRuleBookStore } from './store';

const { auth, router } = vi.hoisted(() => ({
  auth: { user: null as null | { id: string }, isLoading: false },
  router: { isReady: true, query: {} as { graph_id?: string } },
}));
vi.mock('next/router', () => ({ useRouter: () => router }));
vi.mock('@/hooks/useRequireAuth', () => ({ useRequireAuth: () => auth }));
vi.mock('@/components/Layout', () => ({
  default: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock('./components/BuildingGraphView', () => ({ BuildingGraphView: () => null }));
vi.mock('./components/ExecutionConsole', () => ({ ExecutionConsole: () => null }));
vi.mock('./components/OpenQuestionsPanel', () => ({ OpenQuestionsPanel: () => null }));
vi.mock('./components/RuleBookLibraryPanel', () => ({ default: () => null }));
vi.mock('./components/RuleRunner', () => ({ RuleRunner: () => null }));
vi.mock('./components/RuleSummaryPanel', () => ({ RuleSummaryPanel: () => null }));

beforeEach(() => {
  vi.stubGlobal('React', React);
  router.query = { graph_id: 'neo_ready' };
  auth.user = null;
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('authenticated Rulebook graph_id route', () => {
  it('waits for authentication then uses the same ready loader as the toolbar, including empty previews', async () => {
    const fetcher = vi.fn().mockImplementation(async (url) =>
      Response.json(
        url.endsWith('/neo_ready')
          ? {
              success: true,
              graph_id: 'neo_ready',
              graph_uri: 'urn:ready',
              backend: 'neo',
              immutable: true,
              nodes: [],
              edges: [],
              total_triples: 0,
              total_nodes: 0,
              total_edges: 0,
              truncated: false,
            }
          : { graphs: [] },
      ),
    );
    vi.stubGlobal('fetch', fetcher);
    const view = render(<RuleBookPage />);
    expect(fetcher).not.toHaveBeenCalled();
    expect(useRuleBookStore.getState().graph_loaded).toBe(false);
    auth.user = { id: 'owner' };
    view.rerender(<RuleBookPage />);
    await waitFor(() => expect(useRuleBookStore.getState().graph_loaded).toBe(true));
    expect(useRuleBookStore.getState()).toMatchObject({
      selected_graph_source: 'neo_ready',
      chain_derived: false,
      active_graph_data: { id: 'neo_ready' },
    });
    expect(fetcher.mock.calls.filter(([url]) => url.endsWith('/neo_ready'))).toHaveLength(1);
    view.unmount();
    expect(useRuleBookStore.getState().active_graph_data).toBeNull();
  });

  it('clears the prior graph and does not expose it when a different authenticated owner cannot read the URL', async () => {
    auth.user = { id: 'owner' };
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockImplementation(async (url) =>
          url.endsWith('/neo_ready')
            ? new Response('Graph unavailable', { status: 404 })
            : Response.json({ graphs: [] }),
        ),
    );
    const view = render(<RuleBookPage />);
    await waitFor(() => expect(useRuleBookStore.getState().graph_error).toBe('Graph unavailable'));
    expect(useRuleBookStore.getState().graph_loaded).toBe(false);
    auth.user = { id: 'someone-else' };
    view.rerender(<RuleBookPage />);
    await waitFor(() => expect(useRuleBookStore.getState().graph_error).toBe('Graph unavailable'));
    expect(useRuleBookStore.getState().active_graph_data).toBeNull();
  });
});
