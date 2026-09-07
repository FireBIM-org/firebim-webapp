import { BuiltTreeConnection, BuiltTreeResult, RuleData } from '@/features/rulebuilder/editorStore';

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

const ALL_BRANCHES: Branch[] = ['true', 'false', 'unknown'];
const DERIVE_BRANCHES: Branch[] = ['true', 'unknown'];

function branchesForRule(rule: Pick<RuleData, 'element_type'>): Branch[] {
  return rule.element_type === 'derive' ? DERIVE_BRANCHES : ALL_BRANCHES;
}

function collectRuleCycles(rules: RuleData[]): string[][] {
  const byId = new Map<string, RuleData>(rules.map((rule: RuleData) => [rule.id, rule] as const));
  const visited = new Set<string>();
  const activePath = new Set<string>();
  const cycles: string[][] = [];

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
    if (!node) return;

    visited.add(nodeId);
    activePath.add(nodeId);

    for (const branch of branchesForRule(node)) {
      const key = toBranchKey(branch);
      const targetId = node[key];
      if (!targetId || !byId.has(targetId)) continue;
      dfs(targetId, [...stack, targetId]);
    }

    activePath.delete(nodeId);
  }

  for (const rule of rules) {
    if (!visited.has(rule.id)) {
      dfs(rule.id, [rule.id]);
    }
  }

  return cycles;
}

export function buildRuleTreeFromStart(startNodeId: string, rules: RuleData[]): BuiltTreeResult {
  const byId = new Map<string, RuleData>(rules.map((rule: RuleData) => [rule.id, rule] as const));

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

    for (const branch of branchesForRule(node)) {
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
      expression: node.expression ?? null,
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

export function detectCyclesInRules(rules: RuleData[]): string[][] {
  return collectRuleCycles(rules);
}

export function extractRulesFromCanvasNodes(nodes: CanvasRuleNode[]): RuleData[] {
  return nodes
    .map((node: CanvasRuleNode) => node.data?.rule)
    .filter((rule): rule is RuleData => Boolean(rule));
}

export type RuleDraftElement = {
  id: string;
  element_type: 'start' | 'decision' | 'derive' | 'end';
  label?: string | null;
  target_class?: string | null;
  property_path?: string | null;
  operator?: string | null;
  value?: unknown;
  expression?: string | null;
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
  element_type: RuleDraftElement['element_type'];
  missing_fields: Array<'target_class' | 'property_path' | 'operator' | 'expression' | 'true_path'>;
  unexpected_fields: Array<'operator' | 'value' | 'false_path'>;
};

function hasValue(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  return true;
}

export function validateRuleDraft(rule: RuleDraft): RuleDraftValidationIssue[] {
  return rule.elements
    .filter(
      (element: RuleDraftElement) =>
        element.element_type === 'decision' || element.element_type === 'derive',
    )
    .map((element: RuleDraftElement) => {
      const missing_fields: RuleDraftValidationIssue['missing_fields'] = [];
      const unexpected_fields: RuleDraftValidationIssue['unexpected_fields'] = [];

      if (!element.target_class?.trim()) {
        missing_fields.push('target_class');
      }

      if (!element.property_path?.trim()) {
        missing_fields.push('property_path');
      }

      if (element.element_type === 'derive') {
        if (!element.expression?.trim()) {
          missing_fields.push('expression');
        }
        if (!element.true_path?.trim()) {
          missing_fields.push('true_path');
        }
        if (hasValue(element.operator)) {
          unexpected_fields.push('operator');
        }
        if (hasValue(element.value)) {
          unexpected_fields.push('value');
        }
        if (hasValue(element.false_path)) {
          unexpected_fields.push('false_path');
        }
      } else if (!element.operator?.trim()) {
        missing_fields.push('operator');
      }

      return {
        node_id: element.id,
        element_type: element.element_type,
        missing_fields,
        unexpected_fields,
      };
    })
    .filter(
      (issue: RuleDraftValidationIssue) =>
        issue.missing_fields.length > 0 || issue.unexpected_fields.length > 0,
    );
}

export function describeRuleDraftValidationIssue(issue: RuleDraftValidationIssue): string {
  const parts: string[] = [];
  if (issue.missing_fields.length > 0) {
    parts.push(`is missing ${issue.missing_fields.join(', ')}`);
  }
  if (issue.unexpected_fields.length > 0) {
    parts.push(`must not set ${issue.unexpected_fields.join(', ')}`);
  }
  return `${issue.element_type} node "${issue.node_id}" ${parts.join(' and ')}`;
}

export function buildRuleDraftFromTree(
  ruleId: string,
  tree: BuiltTreeResult,
  ruleLabel?: string | null,
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
      expression: node.expression ?? null,
      true_path: node.true_path ?? null,
      false_path: node.false_path ?? null,
      unknown_path: node.unknown_path ?? null,
    })),
  };
}

// Backward-compatible alias while the page is updated.
export const buildRulesetDraftFromTree = buildRuleDraftFromTree;
