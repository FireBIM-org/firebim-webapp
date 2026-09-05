import { describe, expect, it, vi } from 'vitest';

import type { DiagnosticRunResponse, RuleDefinition } from './types';

vi.mock('./api', () => ({
  getRuleOrNull: vi.fn(),
  runDiagnosticCheck: vi.fn(),
}));

import { buildAggregateStep, buildStepDisplay, formatExpectedValue } from './execution';

const NS = 'https://example.org/ontology#';

const rule_definition: RuleDefinition = {
  id: 'rule-derive',
  entry: 'start',
  rule_elements: [
    { id: 'start', element_type: 'start', true_path: 'derive-area' },
    {
      id: 'derive-area',
      element_type: 'derive',
      target_class: `${NS}Room`,
      property_path: `${NS}area`,
      expression: 'width * length',
      true_path: 'check-area',
      unknown_path: 'end-unknown',
    },
    {
      id: 'check-area',
      element_type: 'decision',
      target_class: `${NS}Room`,
      property_path: `${NS}area`,
      operator: '>=',
      value: { $ref: `${NS}minArea` },
      true_path: 'end-pass',
      false_path: 'end-fail',
    },
    { id: 'end-pass', element_type: 'end', value: 'PASS' },
    { id: 'end-fail', element_type: 'end', value: 'FAIL' },
    { id: 'end-unknown', element_type: 'end', value: 'UNKNOWN' },
  ],
};

function makeDiagnosticRun(overrides: Partial<DiagnosticRunResponse> = {}): DiagnosticRunResponse {
  return {
    success: true,
    rule_id: 'rule-derive',
    graph_id: 'graph-1',
    solver: 'standard',
    summary: { total_targets: 1, passed: 1, failed: 0, unknown: 0, conforms: true },
    engine: { engine: 'test', inference: 'rdfs', advanced: true },
    targets: [{ target_node: `${NS}Room_1`, status: 'True' }],
    ...overrides,
  };
}

describe('buildStepDisplay - derive node visits', () => {
  it('renders a written derive step as "Derived <property> = <value>"', () => {
    const display = buildStepDisplay({
      event: {
        event_type: 'node_visit',
        node_id: 'derive-area',
        node_type: 'derive',
        status: 'True',
        target_node: `${NS}Room_1`,
        target_class: `${NS}Room`,
        evidence: {
          derived_value: 12.5,
          property_path: `${NS}area`,
          expression: 'width * length',
          inputs: { [`${NS}width`]: 2.5, [`${NS}length`]: 5 },
        },
      },
      rule_definition,
    });

    expect(display.node_type).toBe('derive');
    expect(display.narration).toBe('Derived area = 12.5');
    expect(display.outcome_label).toBe('Derived area = 12.5 (inputs: width=2.5, length=5)');
    expect(display.derived_inputs).toBe('width=2.5, length=5');
    expect(display.branch_taken).toBe('True');
    expect(display.branch_label).toBe('written');
    expect(display.expected_value).toBeNull();
  });

  it('renders an Unknown derive step with the backend message', () => {
    const display = buildStepDisplay({
      event: {
        event_type: 'node_visit',
        node_id: 'derive-area',
        node_type: 'derive',
        status: 'Unknown',
        target_node: `${NS}Room_1`,
        evidence: {
          property_path: `${NS}area`,
          reason_code: 'missing_input',
          message: 'Missing input width',
          inputs: { [`${NS}width`]: null, [`${NS}length`]: 5 },
        },
      },
      rule_definition,
    });

    expect(display.narration).toBe('Could not derive area: Missing input width');
    expect(display.outcome_label).toContain('Could not derive area: Missing input width');
    expect(display.branch_taken).toBe('Unknown');
    expect(display.branch_label).toBe('missing input');
  });

  it('formats a $ref decision value as "= <local name>" instead of [object Object]', () => {
    const display = buildStepDisplay({
      event: {
        event_type: 'node_visit',
        node_id: 'check-area',
        node_type: 'decision',
        status: 'True',
        target_node: `${NS}Room_1`,
      },
      next_event: { event_type: 'transition', from_node_id: 'check-area', to_node_id: 'end-pass' },
      rule_definition,
    });

    expect(display.expected_value).toBe('= minArea');
    expect(display.operator).toBe('>=');
    expect(display.branch_taken).toBe('True');
  });

  it('treats a derive node as the last executable step in chain_complete', () => {
    const display = buildStepDisplay({
      event: {
        event_type: 'chain_complete',
        target_node: `${NS}Room_1`,
        final_status: 'Unknown',
        terminal_node_id: 'end-unknown',
        node_sequence: ['start', 'derive-area', 'end-unknown'],
      },
      rule_definition,
    });

    expect(display.node_id).toBe('derive-area');
    expect(display.node_type).toBe('derive');
    expect(display.branch_taken).toBe('Unknown');
    expect(display.branch_label).toBe('missing input');
    expect(display.terminal_output).toBe('UNKNOWN');
  });
});

describe('formatExpectedValue', () => {
  it('returns null for missing values and strings for primitives', () => {
    expect(formatExpectedValue(null)).toBeNull();
    expect(formatExpectedValue(undefined)).toBeNull();
    expect(formatExpectedValue(3)).toBe('3');
    expect(formatExpectedValue(true)).toBe('true');
    expect(formatExpectedValue('REI 60')).toBe('REI 60');
  });

  it('renders $ref objects as a local-name reference', () => {
    expect(formatExpectedValue({ $ref: `${NS}minArea` })).toBe('= minArea');
    expect(formatExpectedValue({ $ref: `${NS}hasSpace/${NS}area` })).toBe('= area');
  });

  it('falls back to JSON for other objects', () => {
    expect(formatExpectedValue({ min: 1 })).toBe('{"min":1}');
  });
});

describe('buildAggregateStep', () => {
  it('exposes derived_values and persistence metadata on the step', () => {
    const derived_values = [
      {
        target: `${NS}Room_1`,
        property: `${NS}area`,
        value: 12.5,
        node_id: 'derive-area',
        expression: 'width * length',
        inputs: { [`${NS}width`]: 2.5, [`${NS}length`]: 5 },
      },
    ];

    const step = buildAggregateStep({
      step_index: 0,
      runner_item: { runner_item_id: 'r1', rule_id: 'rule-derive', label: 'Derive rule' },
      diagnostic_run: makeDiagnosticRun({
        derived_values,
        derived_graph_uri: 'https://example.org/graphs/graph-1/derived/rule-derive',
        derived_persisted: true,
      }),
    });

    expect(step.derived_values).toEqual(derived_values);
    expect(step.derived_persisted).toBe(true);
    expect(step.derived_graph_uri).toBe('https://example.org/graphs/graph-1/derived/rule-derive');
    expect(step.console_lines).toContain('Derived values: 1');
    expect(step.console_lines).toContain(
      'Derived graph persisted: https://example.org/graphs/graph-1/derived/rule-derive',
    );
    expect(step.node_results).toEqual({ Room_1: 'True' });
  });

  it('defaults to an empty derived list when the backend sends none', () => {
    const step = buildAggregateStep({
      step_index: 0,
      runner_item: { runner_item_id: 'r1', rule_id: 'rule-derive', label: 'Derive rule' },
      diagnostic_run: makeDiagnosticRun(),
    });

    expect(step.derived_values).toEqual([]);
    expect(step.derived_persisted).toBe(false);
    expect(step.derived_graph_uri).toBeNull();
  });
});
