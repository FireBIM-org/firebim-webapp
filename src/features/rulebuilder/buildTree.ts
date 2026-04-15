import {
  BuiltTreeConnection,
  BuiltTreeResult,
  RuleData,
} from '@/features/rulebuilder/editorStore';

type CanvasRuleNode = {
  id: string;
  data?: {
    rule?: RuleData;
    [key: string]: unknown;
  };
};

type Branch = 'true' | 'false' | 'unknown';

function toBranchKey(branch: Branch): 'true_path' | 'false_path' | 'unknown_path' {
  if (branch === 'true') return 'true_path';
  if (branch === 'false') return 'false_path';
  return 'unknown_path';
}

export function buildRuleTreeFromStart(
  startNodeId: string,
  rules: RuleData[]
): BuiltTreeResult {
  const byId = new Map<string, RuleData>(rules.map((rule) => [rule.id, rule]));

  const visited = new Set<string>();
  const activePath = new Set<string>();
  const missingNodeIds = new Set<string>();
  const cycles: string[][] = [];

  const connections: BuiltTreeConnection[] = [];
  const missingBranches: BuiltTreeResult['missingBranches'] = [];

  function dfs(nodeId: string, stack: string[]) {
    if (activePath.has(nodeId)) {
      const cycleStartIndex = stack.indexOf(nodeId);
      if (cycleStartIndex >= 0) {
        cycles.push(stack.slice(cycleStartIndex));
      }
      return;
    }

    if (visited.has(nodeId)) return;

    const node = byId.get(nodeId);
    if (!node) {
      missingNodeIds.add(nodeId);
      return;
    }

    visited.add(nodeId);
    activePath.add(nodeId);

    const branches: Branch[] = ['true', 'false', 'unknown'];

    for (const branch of branches) {
      const key = toBranchKey(branch);
      const targetId = node[key];

      if (!targetId) continue;

      connections.push({
        source_id: node.id,
        branch: key,
        target_id: targetId,
      });

      if (!byId.has(targetId)) {
        missingNodeIds.add(targetId);
        missingBranches.push({
          source_id: node.id,
          branch: key,
          missing_target_id: targetId,
        });
        continue;
      }

      dfs(targetId, [...stack, targetId]);
    }

    activePath.delete(nodeId);
  }

  dfs(startNodeId, [startNodeId]);

  const nodes = [...visited]
    .map((id) => byId.get(id))
    .filter((node): node is RuleData => Boolean(node))
    .map((node) => ({
      id: node.id,
      element_type: node.element_type,
      target_class: node.target_class ?? null,
      property_path: node.property_path ?? null,
      operator: node.operator ?? null,
      value: node.value,
      true_path: node.true_path ?? null,
      false_path: node.false_path ?? null,
      unknown_path: node.unknown_path ?? null,
    }));

  return {
    entry: startNodeId,
    reachableNodeIds: [...visited],
    nodes,
    connections,
    missingBranches,
    cycles,
  };
}

export function extractRulesFromCanvasNodes(nodes: CanvasRuleNode[]): RuleData[] {
  return nodes
    .map((node) => node.data?.rule)
    .filter((rule): rule is RuleData => Boolean(rule));
}

export type RuleDraftElement = {
  id: string;
  element_type: 'start' | 'decision' | 'end';
  target_class?: string | null;
  property_path?: string | null;
  operator?: string | null;
  value?: unknown;
  true_path?: string | null;
  false_path?: string | null;
  unknown_path?: string | null;
};

export type RuleDraft = {
  id: string;
  entry: string;
  elements: RuleDraftElement[];
};

export function buildRuleDraftFromTree(
  ruleId: string,
  tree: BuiltTreeResult
): RuleDraft {
  return {
    id: ruleId,
    entry: tree.entry,
    elements: tree.nodes.map((node) => ({
      id: node.id,
      element_type: node.element_type,
      target_class: node.target_class ?? null,
      property_path: node.property_path ?? null,
      operator: node.operator ?? null,
      value: node.value,
      true_path: node.true_path ?? null,
      false_path: node.false_path ?? null,
      unknown_path: node.unknown_path ?? null,
    })),
  };
}

// Backward-compatible alias while the page is updated.
export const buildRulesetDraftFromTree = buildRuleDraftFromTree;
