import type { BuildingGraphData, ExecutionStep } from './types';

type CytoscapeStyle = Record<string, string | number | undefined>;
type CytoscapeStylesheetEntry = {
  selector: string;
  style: CytoscapeStyle;
};

export function to_cytoscape_elements(graph: BuildingGraphData) {
  return [
    ...graph.nodes.map((node) => ({
      data: {
        id: node.id,
        label: node.label,
        kind: node.kind,
        parent_id: node.parent_id ?? null,
      },
    })),
    ...graph.edges.map((edge) => ({
      data: {
        id: edge.id,
        source: edge.source,
        target: edge.target,
        relation: edge.relation,
      },
    })),
  ];
}

export function get_base_cytoscape_stylesheet() {
  return [
    {
      selector: 'node',
      style: {
        label: 'data(label)',
        'font-size': 10,
        'text-wrap': 'wrap',
        'text-max-width': 80,
        'background-color': '#cbd5e1',
        'border-width': 1,
        'border-color': '#475569',
        width: 28,
        height: 28,
      },
    },
    {
      selector: 'edge',
      style: {
        width: 1.5,
        'line-color': '#94a3b8',
        'target-arrow-color': '#94a3b8',
        'target-arrow-shape': 'triangle',
        'curve-style': 'bezier',
      },
    },
  ] satisfies CytoscapeStylesheetEntry[];
}

export function get_execution_cytoscape_stylesheet(input: {
  current_step: ExecutionStep | null;
  dim_untouched: boolean;
}) {
  const stylesheet: CytoscapeStylesheetEntry[] = [...get_base_cytoscape_stylesheet()];
  const node_results = input.current_step?.node_results ?? {};

  Object.entries(node_results).forEach(([node_id, result]) => {
    let backgroundColor = '#cbd5e1';
    if (result === 'True') backgroundColor = '#86efac';
    if (result === 'False') backgroundColor = '#fca5a5';
    if (result === 'Unknown') backgroundColor = '#fde68a';

    stylesheet.push({
      selector: `node[id = "${node_id}"]`,
      style: {
        'background-color': backgroundColor,
        'border-width': 2,
        'border-color': '#0f172a',
      },
    });
  });

  if (input.dim_untouched) {
    stylesheet.push({
      selector: 'node',
      style: {
        opacity: 0.9,
      },
    });
  }

  return stylesheet;
}

export function get_hierarchy_layout() {
  return {
    name: 'breadthfirst',
    directed: true,
    padding: 24,
    spacingFactor: 1.2,
  };
}

export function get_detail_layout() {
  return {
    name: 'concentric',
    padding: 24,
    spacingFactor: 1.1,
  };
}
