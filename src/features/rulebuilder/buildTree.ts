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
  const byId = new Map<string, RuleData>(
    rules.map((rule: RuleData) => [rule.id, rule] as const)
  );

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
    .map((id: string) => byId.get(id))
    .filter((node): node is RuleData => Boolean(node))
    .map((node: RuleData) => ({
      id: node.id,
      element_type: node.element_type,
      label: node.label ?? null,
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
    .map((node: CanvasRuleNode) => node.data?.rule)
    .filter((rule): rule is RuleData => Boolean(rule));
}

export type RuleDraftElement = {
  id: string;
  element_type: 'start' | 'decision' | 'end';
  label?: string | null;
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
  label?: string | null;
  entry: string;
  elements: RuleDraftElement[];
};

export type RuleDraftValidationIssue = {
  node_id: string;
  missing_fields: Array<'target_class' | 'property_path' | 'operator'>;
};

export function validateRuleDraft(rule: RuleDraft): RuleDraftValidationIssue[] {
  return rule.elements
    .filter((element: RuleDraftElement) => element.element_type === 'decision')
    .map((element: RuleDraftElement) => {
      const missing_fields: RuleDraftValidationIssue['missing_fields'] = [];

      if (!element.target_class?.trim()) {
        missing_fields.push('target_class');
      }

      if (!element.property_path?.trim()) {
        missing_fields.push('property_path');
      }

      if (!element.operator?.trim()) {
        missing_fields.push('operator');
      }

      return {
        node_id: element.id,
        missing_fields,
      };
    })
    .filter((issue: RuleDraftValidationIssue) => issue.missing_fields.length > 0);
}

export function buildRuleDraftFromTree(
  ruleId: string,
  tree: BuiltTreeResult,
  ruleLabel?: string | null
): RuleDraft {
  return {
    id: ruleId,
    label: ruleLabel ?? null,
    entry: tree.entry,
    elements: tree.nodes.map((node: BuiltTreeResult['nodes'][number]) => ({
      id: node.id,
      element_type: node.element_type,
      label: node.label ?? null,
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
