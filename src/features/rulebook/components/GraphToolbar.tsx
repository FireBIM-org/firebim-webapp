import { ArrowPathIcon, ArrowUpTrayIcon, CubeTransparentIcon } from '@heroicons/react/24/outline';
import { useCallback, useEffect, useRef, useState, type ChangeEvent } from 'react';

import type { BuildingGraphData } from '../types';

import { listStoredBuildingGraphs, publishBuildingGraphJson } from '../api';
import { loadStoredGraph } from '../graph-loading';
import { cloneDefaultOntologyCatalog } from '../ontologyCatalog';
import { useRuleBookStore, type RuleBookStore } from '../store';

async function readJsonUpload(file: File): Promise<unknown> {
  if (!file.name.toLowerCase().endsWith('.json')) {
    throw new Error('Only .json files can be uploaded.');
  }

  try {
    return JSON.parse(await file.text()) as unknown;
  } catch {
    throw new Error('The selected file is not valid JSON.');
  }
}

export function GraphToolbar() {
  const available_graphs = useRuleBookStore((state: RuleBookStore) => state.available_graphs);
  const selected_graph_source = useRuleBookStore(
    (state: RuleBookStore) => state.selected_graph_source,
  );
  const active_graph_data = useRuleBookStore((state: RuleBookStore) => state.active_graph_data);
  const graph_loaded = useRuleBookStore((state: RuleBookStore) => state.graph_loaded);
  const graph_loading = useRuleBookStore((state: RuleBookStore) => state.graph_loading);
  const graph_error = useRuleBookStore((state: RuleBookStore) => state.graph_error);

  const setAvailableGraphs = useRuleBookStore((state: RuleBookStore) => state.setAvailableGraphs);
  const setSelectedGraphSource = useRuleBookStore(
    (state: RuleBookStore) => state.setSelectedGraphSource,
  );
  const setGraphLoading = useRuleBookStore((state: RuleBookStore) => state.setGraphLoading);
  const setGraphError = useRuleBookStore((state: RuleBookStore) => state.setGraphError);
  const graphUploadInputRef = useRef<HTMLInputElement | null>(null);
  const [graphUploading, setGraphUploading] = useState(false);
  const [graphUploadMessage, setGraphUploadMessage] = useState<string | null>(null);
  const [discovering, setDiscovering] = useState(false);

  const loadStoredGraphs = useCallback(
    async (signal?: AbortSignal) => {
      setDiscovering(true);

      try {
        setGraphError(null);
        const graphs = await listStoredBuildingGraphs(signal);
        if (signal?.aborted) return;
        const nextGraphs = graphs.map((graph): BuildingGraphData => ({
          id: graph.graph_id,
          backend: graph.backend,
          immutable: graph.immutable,
          model_id: graph.model_id,
          revision_id: graph.revision_id,
          label: graph.label ?? graph.graph_id,
          description: graph.description ?? null,
          graph_uri: graph.graph_uri ?? null,
          source: graph.source ?? 'api',
          triple_count: graph.triple_count ?? null,
          ttl: null,
          nodes: [],
          edges: [],
          ontology_catalog: cloneDefaultOntologyCatalog(),
        }));

        setAvailableGraphs(nextGraphs);

        if (nextGraphs.length === 0) {
          return;
        }

        if (!useRuleBookStore.getState().selected_graph_source) {
          setSelectedGraphSource(nextGraphs[0].id);
        }
      } catch (error) {
        if (signal?.aborted) return;
        setGraphError(
          error instanceof Error ? error.message : 'Failed to load stored building graphs',
        );
      } finally {
        if (!signal?.aborted) setDiscovering(false);
      }
    },
    [setAvailableGraphs, setGraphError, setSelectedGraphSource],
  );

  useEffect(() => {
    const controller = new AbortController();
    void loadStoredGraphs(controller.signal);
    return () => controller.abort();
  }, [loadStoredGraphs]);

  const handleLoadBuildingGraph = async () => {
    if (!selected_graph_source) {
      setGraphError('Select an API graph to load');
      return;
    }

    await loadStoredGraph(selected_graph_source);
  };

  const handleUploadGraphJson = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';

    if (!file) return;

    setGraphUploading(true);
    setGraphLoading(true);
    setGraphError(null);
    setGraphUploadMessage(null);

    try {
      const json = await readJsonUpload(file);
      const result = await publishBuildingGraphJson(json);

      await loadStoredGraphs();
      setSelectedGraphSource(result.graph_id);
      setGraphUploadMessage(`Uploaded graph: ${result.graph_id}`);
    } catch (error) {
      setGraphUploadMessage(null);
      setGraphError(error instanceof Error ? error.message : 'Graph upload failed');
    } finally {
      setGraphUploading(false);
      setGraphLoading(false);
    }
  };

  return (
    <div className="border-b border-gray-200 bg-white px-4 py-3">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex w-full min-w-0 flex-wrap items-center gap-3">
          <label
            htmlFor="stored-building-graph"
            className="shrink-0 text-xs font-semibold tracking-wide text-gray-500 uppercase"
          >
            Building graph
          </label>

          <select
            id="stored-building-graph"
            value={selected_graph_source}
            onChange={(event) => setSelectedGraphSource(event.target.value)}
            className="min-w-0 flex-1 basis-48 rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 shadow-sm transition outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-100"
          >
            {selected_graph_source &&
              !available_graphs.some((graph) => graph.id === selected_graph_source) && (
                <option value={selected_graph_source}>{selected_graph_source}</option>
              )}
            {available_graphs.length === 0 ? (
              <option value="">No stored graphs found</option>
            ) : (
              available_graphs.map((graph: BuildingGraphData) => (
                <option key={graph.id} value={graph.id} title={graph.description ?? undefined}>
                  {graph.source === 'ontop' ? '[Ontop] ' : ''}
                  {graph.label}
                  {graph.triple_count != null ? ` - ${graph.triple_count} triples` : ''}
                </option>
              ))
            )}
          </select>
        </div>

        <button
          type="button"
          onClick={() => void loadStoredGraphs()}
          disabled={graph_loading || discovering}
          className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 shadow-sm transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <ArrowPathIcon className={['h-4 w-4', graph_loading ? 'animate-spin' : ''].join(' ')} />
          {discovering ? 'Refreshing...' : 'Refresh graphs'}
        </button>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void handleLoadBuildingGraph()}
            disabled={graph_loading || !selected_graph_source}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-sky-600 px-3 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <ArrowUpTrayIcon className="h-4 w-4" />
            {graph_loading && !graphUploading ? 'Loading...' : 'Load graph'}
          </button>

          <input
            ref={graphUploadInputRef}
            type="file"
            accept=".json,application/json"
            className="hidden"
            onChange={(event) => {
              void handleUploadGraphJson(event);
            }}
          />

          <button
            type="button"
            onClick={() => graphUploadInputRef.current?.click()}
            disabled={graph_loading || graphUploading}
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 shadow-sm transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
            title="Upload a graph JSON file"
          >
            <ArrowUpTrayIcon
              className={['h-4 w-4', graphUploading ? 'animate-pulse' : ''].join(' ')}
            />
            {graphUploading ? 'Uploading...' : 'Upload graph JSON'}
          </button>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
        <div className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-slate-700">
          <CubeTransparentIcon className="h-4 w-4" />
          {graph_loaded && active_graph_data
            ? `${active_graph_data.label}${
                active_graph_data.source ? ` - ${active_graph_data.source}` : ''
              }`
            : 'No graph loaded'}
        </div>

        {active_graph_data?.triple_count != null ? (
          <div className="rounded-full bg-slate-100 px-3 py-1 text-slate-700">
            {active_graph_data.triple_count} triples
          </div>
        ) : null}

        {graph_error ? (
          <div className="rounded-full bg-red-50 px-3 py-1 text-red-700">{graph_error}</div>
        ) : null}

        {graphUploadMessage ? (
          <div className="rounded-full bg-emerald-50 px-3 py-1 text-emerald-700">
            {graphUploadMessage}
          </div>
        ) : null}
      </div>

      {graph_loaded && active_graph_data?.backend === 'neo' && (
        <p role="status" className="mt-2 text-xs text-slate-600">
          Immutable revision {active_graph_data.revision_id}. Preview:{' '}
          {active_graph_data.preview_triples ?? active_graph_data.edges.length} of{' '}
          {active_graph_data.triple_count ?? 0} triples · {active_graph_data.nodes.length} of{' '}
          {active_graph_data.total_nodes ?? 0} nodes.
          {active_graph_data.truncated
            ? ' Preview truncated; checks use the complete qualified server dataset.'
            : ' Checks use the complete qualified server dataset.'}
          {active_graph_data.nodes.length === 0
            ? ' This ready graph has an empty preview; it is still available for compatibility and checks.'
            : ''}
        </p>
      )}

      {graph_loaded && active_graph_data?.description ? (
        <p
          className="mt-2 text-xs whitespace-pre-line text-slate-600"
          data-testid="graph-description"
        >
          {active_graph_data.description}
        </p>
      ) : null}
    </div>
  );
}
