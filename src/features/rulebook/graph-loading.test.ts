import { afterEach, describe, expect, it, vi } from 'vitest';

import { clearStoredGraph, loadStoredGraph } from './graph-loading';
import { useRuleBookStore } from './store';

afterEach(() => {
  clearStoredGraph();
  vi.unstubAllGlobals();
});

function preview(graph_id = 'neo_ready') {
  return {
    success: true,
    graph_id,
    graph_uri: `https://example.org/${graph_id}`,
    backend: 'neo',
    immutable: true,
    nodes: [],
    edges: [],
    ttl: '',
    total_triples: 0,
    total_nodes: 0,
    total_edges: 0,
    preview_triples: 0,
    truncated: false,
  };
}

describe('shared authenticated ready graph loading', () => {
  it('loads an empty ready graph by graph ID, clears prior execution and disables persistence', async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json(preview()));
    vi.stubGlobal('fetch', fetcher);
    useRuleBookStore.getState().setChainDerived(true);
    await loadStoredGraph('neo_ready');
    expect(fetcher).toHaveBeenCalledWith(
      '/api/proxy/graphs/neo_ready',
      expect.objectContaining({ credentials: 'same-origin' }),
    );
    expect(useRuleBookStore.getState()).toMatchObject({
      graph_loaded: true,
      graph_loading: false,
      chain_derived: false,
      active_graph_data: { id: 'neo_ready', immutable: true, nodes: [], total_nodes: 0 },
      execution_timeline: null,
    });
  });

  it.each([401, 403, 404, 503])(
    'does not fall back to an unauthorized or unpublished graph (%i)',
    async (status) => {
      const fetcher = vi.fn().mockResolvedValue(new Response('Graph unavailable', { status }));
      vi.stubGlobal('fetch', fetcher);
      await loadStoredGraph('neo_private');
      expect(fetcher).toHaveBeenCalledTimes(1);
      expect(useRuleBookStore.getState()).toMatchObject({
        graph_loaded: false,
        active_graph_data: null,
        graph_error: 'Graph unavailable',
      });
    },
  );

  it('encodes legacy IDs and rejects graph identity substitution', async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json(preview('neo_other')));
    vi.stubGlobal('fetch', fetcher);
    await loadStoredGraph('legacy/#?');
    expect(fetcher.mock.calls[0][0]).toBe('/api/proxy/graphs/legacy%2F%23%3F');
    expect(useRuleBookStore.getState().graph_loaded).toBe(false);
    expect(useRuleBookStore.getState().graph_error).toContain('identity');
  });

  it('does not apply a stale preview after a newer graph was selected', async () => {
    let resolve!: (value: Response) => void;
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockImplementationOnce(
          () =>
            new Promise((done) => {
              resolve = done;
            }),
        )
        .mockResolvedValueOnce(Response.json(preview('neo_new'))),
    );
    const first = loadStoredGraph('neo_old');
    await loadStoredGraph('neo_new');
    resolve(Response.json(preview('neo_old')));
    await first;
    expect(useRuleBookStore.getState().active_graph_data?.id).toBe('neo_new');
  });

  it('does not load a response after navigation cancellation', async () => {
    const controller = new AbortController();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(async () => {
        controller.abort();
        return Response.json(preview());
      }),
    );
    await loadStoredGraph('neo_ready', controller.signal);
    expect(useRuleBookStore.getState().graph_loaded).toBe(false);
  });
});
