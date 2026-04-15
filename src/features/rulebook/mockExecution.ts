import type {
  BuildingGraphData,
  ExecutionStep,
  ExecutionTimeline,
  NodeEvaluationResult,
  RuleDefinition,
} from './types';

type BuildMockExecutionTimelineInput = {
  graph: BuildingGraphData;
  rules: RuleDefinition[];
};

function hashString(value: string): number {
  let hash = 0;

  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  }

  return hash;
}

function getRuleTargetClass(rule: RuleDefinition): string | null {
  for (const rule_element of rule.rule_elements) {
    if (rule_element.target_class) {
      return rule_element.target_class;
    }
  }

  return null;
}

function getTargetNodes(graph: BuildingGraphData, target_class: string | null) {
  if (!target_class) {
    return [];
  }

  return graph.nodes.filter((node) => node.kind === target_class);
}

function computeNodeResult(
  rule_id: string,
  node_id: string
): NodeEvaluationResult {
  const hash = hashString(`${rule_id}::${node_id}`) % 9;

  if (hash <= 3) return 'True';
  if (hash <= 6) return 'False';
  return 'Unknown';
}

function summarizeNodeResults(node_results: Record<string, NodeEvaluationResult>) {
  let true_count = 0;
  let false_count = 0;
  let unknown_count = 0;
  let affected_node_count = 0;

  for (const result of Object.values(node_results)) {
    if (result === 'Untouched') continue;

    affected_node_count += 1;

    if (result === 'True') true_count += 1;
    if (result === 'False') false_count += 1;
    if (result === 'Unknown') unknown_count += 1;
  }

  return {
    true_count,
    false_count,
    unknown_count,
    affected_node_count,
  };
}

function buildConsoleLines(
  graph: BuildingGraphData,
  rule: RuleDefinition,
  node_results: Record<string, NodeEvaluationResult>,
  target_class: string | null
): string[] {
  const target_nodes = getTargetNodes(graph, target_class);
  const decision = rule.rule_elements.find(
    (rule_element) => rule_element.element_type === 'decision'
  );

  if (target_nodes.length === 0) {
    return [
      `No ${target_class ?? 'target'} nodes found in the loaded building graph.`,
    ];
  }

  return target_nodes.slice(0, 8).map((node) => {
    const result = node_results[node.id] ?? 'Untouched';

    if (!decision) {
      return `${node.label} => ${result}`;
    }

    const property_path = decision.property_path ?? 'unknown property';
    const short_property = property_path.split('/').filter(Boolean).pop() ?? property_path;
    const operator = decision.operator ?? '?';
    const value =
      decision.value === null || decision.value === undefined
        ? 'null'
        : String(decision.value);

    return `${node.label} · ${short_property} ${operator} ${value} => ${result}`;
  });
}

export function buildMockExecutionTimeline({
  graph,
  rules,
}: BuildMockExecutionTimelineInput): ExecutionTimeline {
  const steps: ExecutionStep[] = rules.map((rule, index) => {
    const target_class = getRuleTargetClass(rule);
    const target_nodes = getTargetNodes(graph, target_class);

    const node_results: Record<string, NodeEvaluationResult> = {};

    for (const node of graph.nodes) {
      node_results[node.id] = 'Untouched';
    }

    for (const node of target_nodes) {
      node_results[node.id] = computeNodeResult(rule.id, node.id);
    }

    const summary = summarizeNodeResults(node_results);
    const console_lines = buildConsoleLines(graph, rule, node_results, target_class);

    return {
      step_index: index,
      rule_id: rule.id,
      rule_label: rule.id,
      target_class,
      summary,
      node_results,
      console_lines,
    };
  });

  return {
    graph_id: graph.id,
    steps,
  };
}