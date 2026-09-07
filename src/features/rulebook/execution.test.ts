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

describe('rule links (end elements with next_rule)', () => {
  it('collectRuleLinks pairs a linking end with the targets that reached it', async () => {
    const { collectRuleLinks } = await import('./execution');
    const run = makeDiagnosticRun({
      targets: [
        { target_node: `${NS}c1`, status: 'True', terminal_node_id: 'disp-to-ak2' },
        { target_node: `${NS}c2`, status: 'True', terminal_node_id: 'disp-other' },
        { target_node: `${NS}c3`, status: 'True', terminal_node_id: 'disp-to-ak2' },
      ],
      end_nodes: [
        { end_node_id: 'disp-to-ak2', next_rule: 'dk-compartments-size-ak2-v2' },
        { end_node_id: 'disp-other', terminal_kind: 'not_applicable' },
      ],
    });
    expect(collectRuleLinks(run)).toEqual([
      {
        end_node_id: 'disp-to-ak2',
        next_rule: 'dk-compartments-size-ak2-v2',
        target_nodes: [`${NS}c1`, `${NS}c3`],
      },
    ]);
  });

  it('buildRuleRunnerExecutionTimeline chains the linked rule for those targets only, without loops', async () => {
    const api = await import('./api');
    const { buildRuleRunnerExecutionTimeline } = await import('./execution');
    const calls: Array<{ rule_id: string; options?: Record<string, unknown> }> = [];
    vi.mocked(api.runDiagnosticCheck).mockImplementation(async (input) => {
      calls.push({ rule_id: input.rule_id, options: input.options as Record<string, unknown> });
      if (input.rule_id === 'dispatcher') {
        return makeDiagnosticRun({
          rule_id: 'dispatcher',
          targets: [
            { target_node: `${NS}c1`, status: 'True', terminal_node_id: 'to-ak2' },
            { target_node: `${NS}c2`, status: 'True', terminal_node_id: 'other' },
          ],
          end_nodes: [{ end_node_id: 'to-ak2', next_rule: 'ak2' }],
        });
      }
      // the linked rule links back to the dispatcher: must not be enqueued again
      return makeDiagnosticRun({
        rule_id: 'ak2',
        targets: [{ target_node: `${NS}c1`, status: 'False', terminal_node_id: 'back' }],
        end_nodes: [{ end_node_id: 'back', next_rule: 'dispatcher' }],
      });
    });
    vi.mocked(api.getRuleOrNull).mockResolvedValue(null);

    await buildRuleRunnerExecutionTimeline({
      active_graph_data: { id: 'graph-1', graph_uri: 'g', label: 'g', triple_count: 1 } as never,
      runner_rule_items: [{ runner_item_id: 'r1', rule_id: 'dispatcher', label: 'Dispatcher' }],
      available_rules: [{ rule_id: 'ak2', label: 'AK2 size' } as never],
      solver: 'standard',
      chain_derived: true,
    });
    expect(calls.map((c) => c.rule_id)).toEqual(['dispatcher', 'ak2']);
    expect(calls[1].options?.target_nodes).toEqual([`${NS}c1`]);
    expect(calls[1].options?.use_derived_from).toEqual(['dispatcher']);
  });
});

describe('rule links: order and missing rules', () => {
  it('runs several linked rules in end-element order, each scoped to its own targets', async () => {
    const api = await import('./api');
    const { buildRuleRunnerExecutionTimeline } = await import('./execution');
    const calls: Array<{ rule_id: string; options?: Record<string, unknown> }> = [];
    vi.mocked(api.runDiagnosticCheck).mockImplementation(async (input) => {
      calls.push({ rule_id: input.rule_id, options: input.options as Record<string, unknown> });
      if (input.rule_id === 'dispatcher') {
        return makeDiagnosticRun({
          rule_id: 'dispatcher',
          targets: [
            { target_node: `${NS}c1`, status: 'True', terminal_node_id: 'to-ak2' },
            { target_node: `${NS}c2`, status: 'True', terminal_node_id: 'to-ak3' },
            { target_node: `${NS}c3`, status: 'True', terminal_node_id: 'to-ak2' },
          ],
          end_nodes: [
            { end_node_id: 'to-ak2', next_rule: 'ak2' },
            { end_node_id: 'to-ak3', next_rule: 'ak3' },
          ],
        });
      }
      return makeDiagnosticRun({ rule_id: input.rule_id, targets: [], end_nodes: [] });
    });
    vi.mocked(api.getRuleOrNull).mockResolvedValue(null);

    await buildRuleRunnerExecutionTimeline({
      active_graph_data: { id: 'graph-1', graph_uri: 'g', label: 'g', triple_count: 1 } as never,
      runner_rule_items: [{ runner_item_id: 'r1', rule_id: 'dispatcher', label: 'Dispatcher' }],
      available_rules: [],
      solver: 'standard',
      chain_derived: false,
    });
    expect(calls.map((c) => c.rule_id)).toEqual(['dispatcher', 'ak2', 'ak3']);
    expect(calls[1].options?.target_nodes).toEqual([`${NS}c1`, `${NS}c3`]);
    expect(calls[2].options?.target_nodes).toEqual([`${NS}c2`]);
  });
});

describe('open questions and overrides', () => {
  it('collects the questions of every run (deduped by where the answer is written) and passes overrides', async () => {
    const api = await import('./api');
    const { buildRuleRunnerExecutionTimeline } = await import('./execution');
    const calls: Array<{ rule_id: string; options?: Record<string, unknown> }> = [];
    const question = {
      target_node: `${NS}c1`,
      node_id: 'q',
      node_type: 'decision',
      label: 'Sprinklered?',
      property_path: 'https://firebim.org/ontologies/fbo/dk#HasAutomaticFireSprinklersystem',
      operator: '==',
      value: true,
      kind: 'boolean',
      options: [true, false],
      write_subject: `${NS}c1`,
      write_property: 'https://firebim.org/ontologies/fbo/dk#HasAutomaticFireSprinklersystem',
    };
    vi.mocked(api.runDiagnosticCheck).mockImplementation(async (input) => {
      calls.push({ rule_id: input.rule_id, options: input.options as Record<string, unknown> });
      return {
        ...makeDiagnosticRun({
          rule_id: input.rule_id,
          targets: [{ target_node: `${NS}c1`, status: 'Unknown', terminal_node_id: 'ask' }],
          end_nodes: [],
        }),
        questions: [question],
      } as never;
    });
    vi.mocked(api.getRuleOrNull).mockResolvedValue(null);
    const overrides = [{ subject: `${NS}c2`, property: 'p', value: 1 }];
    const timeline = await buildRuleRunnerExecutionTimeline({
      active_graph_data: { id: 'graph-1', graph_uri: 'g', label: 'g', triple_count: 1 } as never,
      runner_rule_items: [
        { runner_item_id: 'r1', rule_id: 'a', label: 'Rule A' },
        { runner_item_id: 'r2', rule_id: 'b', label: 'Rule B' },
      ],
      available_rules: [],
      solver: 'standard',
      chain_derived: false,
      overrides,
    });
    expect(calls.every((c) => c.options?.overrides === overrides)).toBe(true);
    expect(timeline.questions).toHaveLength(1); // same subject|property asked by both rules → once
    expect(timeline.questions?.[0].rule_label).toBe('Rule A');
    expect(timeline.questions?.[0].key).toBe(`${NS}c1|${question.write_property}`);
    expect(
      timeline.run_summaries?.map((run) => [run.rule_label, run.success, run.total_targets]),
    ).toEqual([
      ['Rule A', true, 1],
      ['Rule B', true, 1],
    ]);
  });
});
