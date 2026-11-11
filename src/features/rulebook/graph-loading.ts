import { fetchStoredBuildingGraphRaw, parseBuildingGraphTtl } from './api';
import { cloneDefaultOntologyCatalog } from './ontologyCatalog';
import { useRuleBookStore } from './store';

let generation = 0;

export function clearStoredGraph() {
  generation++;
  const store = useRuleBookStore.getState();
  store.setGraphLoaded(false);
  store.setActiveGraphData(null);
  store.setActiveGraphUri(null);
  store.setGraphLoading(false);
  store.setOverrides([]);
  store.resetExecution();
}

export async function loadStoredGraph(graphId: string, signal?: AbortSignal) {
  clearStoredGraph();
  const current = generation;
  const store = useRuleBookStore.getState();
  store.setSelectedGraphSource(graphId);
  store.setGraphLoading(true);
  store.setGraphError(null);
  try {
    const payload = await fetchStoredBuildingGraphRaw(graphId, signal);
    if (signal?.aborted || current !== generation) return;
    const graph = parseBuildingGraphTtl(
      payload,
      payload.backend === 'neo' ? {} : cloneDefaultOntologyCatalog(),
    );
    if (graph.backend === 'neo' && graph.immutable !== true)
      throw new Error('Neo graph is not a ready immutable publication');
    store.setActiveGraphData(graph);
    store.setActiveGraphUri(graph.graph_uri ?? graph.id);
    store.setGraphLoaded(true);
    if (graph.immutable || graph.backend === 'neo') store.setChainDerived(false);
    store.setExecutionStatus('ready');
  } catch (error) {
    if (!signal?.aborted && current === generation)
      store.setGraphError(error instanceof Error ? error.message : 'Failed to load graph');
  } finally {
    if (current === generation) store.setGraphLoading(false);
  }
}
