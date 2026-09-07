import { describe, expect, it } from 'vitest';

import type { RuleData } from './editorStore';

import {
  buildRuleDraftFromTree,
  buildRuleTreeFromStart,
  describeRuleDraftValidationIssue,
  detectCyclesInRules,
  validateRuleDraft,
  type RuleDraft,
} from './buildTree';

const TARGET = 'https://firebim.org/ontologies/fbo#Wall';
const PROPERTY = 'https://firebim.org/ontologies/fbo/lt#GCoeficient';

function start(id: string, truePath: string | null): RuleData {
  return { id, element_type: 'start', label: 'Start', true_path: truePath };
}

function end(id: string): RuleData {
  return { id, element_type: 'end', label: 'End', config: { output_text: 'done' } };
}

function derive(id: string, overrides: Partial<RuleData> = {}): RuleData {
  return {
    id,
    element_type: 'derive',
    label: 'Derive',
    target_class: TARGET,
    property_path: PROPERTY,
    expression: '$fbo-lt:GCoeficient * 2',
    true_path: null,
    false_path: null,
    unknown_path: null,
    ...overrides,
  };
}

function decision(id: string, overrides: Partial<RuleData> = {}): RuleData {
  return {
    id,
    element_type: 'decision',
    label: 'Decision',
    target_class: TARGET,
    property_path: PROPERTY,
    operator: '>',
    value: 1,
    true_path: null,
    false_path: null,
    unknown_path: null,
    ...overrides,
  };
}

function draftOf(elements: RuleData[], entry = 'start'): RuleDraft {
  return { id: 'rule', label: 'Rule', entry, elements };
}

describe('validateRuleDraft (derive)', () => {
  it('accepts a complete derive element', () => {
    const draft = draftOf([start('start', 'd1'), derive('d1', { true_path: 'end' }), end('end')]);
    expect(validateRuleDraft(draft)).toEqual([]);
  });

  it('reports missing target_class, property_path, expression and true_path', () => {
    const draft = draftOf([
      start('start', 'd1'),
      derive('d1', { target_class: '', property_path: '  ', expression: null, true_path: null }),
    ]);

    const issues = validateRuleDraft(draft);
    expect(issues).toHaveLength(1);
    expect(issues[0].node_id).toBe('d1');
    expect(issues[0].element_type).toBe('derive');
    expect(issues[0].missing_fields).toEqual([
      'target_class',
      'property_path',
      'expression',
      'true_path',
    ]);
    expect(issues[0].unexpected_fields).toEqual([]);
  });

  it('rejects operator, value and false_path on a derive element', () => {
    const draft = draftOf([
      start('start', 'd1'),
      derive('d1', { true_path: 'end', operator: '>', value: 3, false_path: 'end' }),
      end('end'),
    ]);

    const issues = validateRuleDraft(draft);
    expect(issues).toHaveLength(1);
    expect(issues[0].missing_fields).toEqual([]);
    expect(issues[0].unexpected_fields).toEqual(['operator', 'value', 'false_path']);
    expect(describeRuleDraftValidationIssue(issues[0])).toBe(
      'derive node "d1" must not set operator, value, false_path',
    );
  });

  it('does not require operator for derive but still does for decision', () => {
    const draft = draftOf([
      start('start', 'd1'),
      derive('d1', { true_path: 'q1' }),
      decision('q1', { operator: '', true_path: 'end', false_path: 'end' }),
      end('end'),
    ]);

    const issues = validateRuleDraft(draft);
    expect(issues.map((issue) => issue.node_id)).toEqual(['q1']);
    expect(issues[0].missing_fields).toEqual(['operator']);
    expect(describeRuleDraftValidationIssue(issues[0])).toBe(
      'decision node "q1" is missing operator',
    );
  });
});

describe('buildRuleTreeFromStart / buildRuleDraftFromTree', () => {
  it('keeps the expression of a derive node through the built tree and the draft', () => {
    const rules = [start('start', 'd1'), derive('d1', { true_path: 'end' }), end('end')];

    const tree = buildRuleTreeFromStart('start', rules);
    expect(tree.reachableNodeIds).toEqual(['start', 'd1', 'end']);
    expect(tree.missingBranches).toEqual([]);
    expect(tree.cycles).toEqual([]);

    const built = tree.nodes.find((node) => node.id === 'd1');
    expect(built?.element_type).toBe('derive');
    expect(built?.expression).toBe('$fbo-lt:GCoeficient * 2');

    const draft = buildRuleDraftFromTree('rule', tree, 'Rule');
    const element = draft.elements.find((candidate) => candidate.id === 'd1');
    expect(element?.element_type).toBe('derive');
    expect(element?.expression).toBe('$fbo-lt:GCoeficient * 2');
    expect(element?.operator).toBeNull();
    expect(element?.false_path).toBeNull();
    expect(validateRuleDraft(draft)).toEqual([]);
  });

  it('follows the unknown branch but never a false branch on a derive node', () => {
    const rules = [
      start('start', 'd1'),
      derive('d1', { true_path: 'end', unknown_path: 'missing', false_path: 'ghost' }),
      end('end'),
      end('missing'),
    ];

    const tree = buildRuleTreeFromStart('start', rules);
    expect(tree.connections).toEqual([
      { source_id: 'start', branch: 'true_path', target_id: 'd1' },
      { source_id: 'd1', branch: 'true_path', target_id: 'end' },
      { source_id: 'd1', branch: 'unknown_path', target_id: 'missing' },
    ]);
    expect(tree.missingBranches).toEqual([]);
  });

  it('detects a cycle that passes through a derive node', () => {
    const rules = [
      start('start', 'd1'),
      derive('d1', { true_path: 'q1' }),
      decision('q1', { true_path: 'd1', false_path: 'end' }),
      end('end'),
    ];

    const tree = buildRuleTreeFromStart('start', rules);
    expect(tree.cycles).toEqual([['d1', 'q1', 'd1']]);
    expect(detectCyclesInRules(rules)).toEqual([['d1', 'q1', 'd1']]);
  });

  it('keeps a $ref value object on a decision node', () => {
    const ref = { $ref: 'https://firebim.org/ontologies/fbo/lt#MaxGCoeficient' };
    const rules = [
      start('start', 'q1'),
      decision('q1', { operator: '<=', value: ref, true_path: 'end', false_path: 'end' }),
      end('end'),
    ];

    const tree = buildRuleTreeFromStart('start', rules);
    const draft = buildRuleDraftFromTree('rule', tree, 'Rule');
    const element = draft.elements.find((candidate) => candidate.id === 'q1');
    expect(element?.value).toEqual(ref);
    expect(validateRuleDraft(draft)).toEqual([]);
  });
});
