import type {
  BuildingGraphData,
  DerivedValue,
  DiagnosticRunResponse,
  DiagnosticSequenceEvent,
  ExecutionStep,
  NodeEvaluationResult,
  RuleDefinition,
  RuleListItem,
  RuleRunnerItem,
} from './types';

import { getRuleOrNull, runDiagnosticCheck } from './api';

type StepRawJson = {
  diagnostic_run: DiagnosticRunResponse;
  compatibility: DiagnosticRunResponse['compatibility'] | null;
  event?: DiagnosticSequenceEvent;
  step_display?: {
    event_type: string;
    node_id?: string | null;
    node_label?: string | null;
    sample_target_label?: string | null;
    target_class_label?: string | null;
    property_label?: string | null;
    property_path?: string | null;
    operator?: string | null;
    expected_value?: string | null;
    true_path?: string | null;
    false_path?: string | null;
    unknown_path?: string | null;
    branch_taken?: 'True' | 'False' | 'Unknown' | null;
    branch_label?: string | null;
    node_type?: string | null;
    expression?: string | null;
    derived_value?: string | null;
    derived_inputs?: string | null;
    narration?: string | null;
    terminal_label?: string | null;
    terminal_output?: string | null;
    outcome_label?: string | null;
  };
};

export type StepDisplay = NonNullable<StepRawJson['step_display']>;

type RuleElement = RuleDefinition['rule_elements'][number];

function isReferenceValue(value: unknown): value is { $ref: string } {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as Record<string, unknown>).$ref === 'string'
  );
}

export function formatValue(value: unknown): string {
  if (value == null) return 'null';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (isReferenceValue(value)) return `= ${localNameFromToken(value.$ref) ?? value.$ref}`;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export function formatExpectedValue(value: unknown): string | null {
  if (value == null) return null;
  return formatValue(value);
}

function formatInputs(inputs: unknown): string | null {
  if (typeof inputs !== 'object' || inputs === null) return null;
  const entries = Object.entries(inputs as Record<string, unknown>);
  if (entries.length === 0) return null;
  return entries
    .map(([key, value]) => `${localNameFromToken(key) ?? key}=${formatValue(value)}`)
    .join(', ');
}

function isExecutableElement(element?: RuleElement) {
  return element?.element_type === 'decision' || element?.element_type === 'derive';
}

function resolveNodeType(event: DiagnosticSequenceEvent, element?: RuleElement) {
  if (typeof event.node_type === 'string' && event.node_type) return event.node_type;
  return element?.element_type ?? null;
}

function buildDeriveNarration(input: {
  status: string | null;
  property_label: string | null;
  derived_value: string | null;
  message: string | null;
}) {
  const property = input.property_label ?? 'value';
  if (input.status === 'Unknown') {
    return `Could not derive ${property}${input.message ? `: ${input.message}` : ''}`;
  }
  return `Derived ${property} = ${input.derived_value ?? 'null'}`;
}

function normalizeNodeResult(value: string | null | undefined): NodeEvaluationResult {
  if (value === 'True' || value === 'False' || value === 'Unknown') {
    return value;
  }
  return 'Untouched';
}

function localNameFromToken(token: string | null | undefined): string | null {
  if (!token) return null;

  if (token.includes('#')) {
    return token.split('#').pop() ?? token;
  }

  const parts = token.split('/').filter(Boolean);
  return parts.length > 0 ? parts[parts.length - 1] : token;
}

function extractTargetNodeIds(event: DiagnosticSequenceEvent): string[] {
  const ids = new Set<string>();
  const record = event as Record<string, unknown>;
  const candidateValues = [
    event.target_node,
    typeof record.sample_target === 'string' ? (record.sample_target as string) : null,
  ];

  for (const value of candidateValues) {
    const localName = localNameFromToken(value);
    if (localName) {
      ids.add(localName);
    }
  }

  return Array.from(ids);
}

function buildRuleElementMap(rule_definition?: RuleDefinition | null) {
  const map = new Map<string, RuleDefinition['rule_elements'][number]>();

  for (const element of rule_definition?.rule_elements ?? []) {
    map.set(element.id, element);
  }

  return map;
}

function getEndNodeOutput(element?: RuleDefinition['rule_elements'][number]): string | null {
  if (!element) {
    return null;
  }

  const terminal =
    (typeof element.config?.terminal_value === 'string' && element.config.terminal_value) ||
    (typeof element.value === 'string' && element.value) ||
    (typeof element.label === 'string' && element.label) ||
    null;

  return terminal;
}

function buildStepDisplayInternal(input: {
  event: DiagnosticSequenceEvent;
  next_event?: DiagnosticSequenceEvent;
  rule_elements_by_id: Map<string, RuleDefinition['rule_elements'][number]>;
}) {
  const event_type =
    typeof input.event.event_type === 'string' ? input.event.event_type : 'diagnostic_event';
  const sample_target_label =
    localNameFromToken(
      (typeof input.event.sample_target === 'string' && input.event.sample_target) ||
        input.event.target_node,
    ) ?? null;
  const target_class_label = localNameFromToken(input.event.target_class);
  const property_label = localNameFromToken(
    typeof input.event.property_path === 'string' ? input.event.property_path : null,
  );
  const current_node_id = localNameFromToken(input.event.node_id);
  const current_element = current_node_id
    ? input.rule_elements_by_id.get(current_node_id)
    : undefined;
  const current_node_type = resolveNodeType(input.event, current_element);
  const evidence =
    typeof input.event.evidence === 'object' && input.event.evidence !== null
      ? input.event.evidence
      : {};
  const next_to_node_id =
    typeof input.next_event?.to_node_id === 'string'
      ? localNameFromToken(input.next_event.to_node_id)
      : null;
  const resolveBranchTaken = (
    element?: RuleDefinition['rule_elements'][number],
    terminal_node_id?: string | null,
  ): 'True' | 'False' | 'Unknown' | null => {
    if (!element) {
      return null;
    }

    const target_node_id = terminal_node_id ?? next_to_node_id;
    if (!target_node_id) {
      if (element.element_type === 'derive') {
        const status = typeof input.event.status === 'string' ? input.event.status : null;
        return status === 'Unknown' ? 'Unknown' : status === 'True' ? 'True' : null;
      }
      return null;
    }

    if (localNameFromToken(element.true_path) === target_node_id) {
      return 'True';
    }
    if (
      element.element_type !== 'derive' &&
      localNameFromToken(element.false_path) === target_node_id
    ) {
      return 'False';
    }
    if (localNameFromToken(element.unknown_path) === target_node_id) {
      return 'Unknown';
    }
    return null;
  };
  const describeBranch = (
    element: RuleElement | undefined,
    branch: 'True' | 'False' | 'Unknown' | null,
    node_type: string | null = element?.element_type ?? null,
  ): string | null => {
    if (!branch) return null;
    if (node_type === 'derive') {
      return branch === 'Unknown' ? 'missing input' : 'written';
    }
    return branch;
  };

  if (event_type === 'chain_complete') {
    const node_sequence = Array.isArray(input.event.node_sequence)
      ? (input.event.node_sequence as string[])
      : [];
    const last_decision_id =
      [...node_sequence].reverse().find((node_id) => {
        const element = input.rule_elements_by_id.get(localNameFromToken(node_id) ?? node_id);
        return isExecutableElement(element);
      }) ?? null;
    const last_decision = last_decision_id
      ? input.rule_elements_by_id.get(localNameFromToken(last_decision_id) ?? last_decision_id)
      : undefined;
    const terminal_id = localNameFromToken(input.event.terminal_node_id);
    const terminal_element = terminal_id ? input.rule_elements_by_id.get(terminal_id) : undefined;
    const terminal_output = getEndNodeOutput(terminal_element);
    const branch_taken = resolveBranchTaken(last_decision, terminal_id);

    return {
      event_type,
      node_id: last_decision_id,
      node_label: last_decision?.label ?? null,
      sample_target_label,
      target_class_label: localNameFromToken(last_decision?.target_class) ?? target_class_label,
      property_label: localNameFromToken(last_decision?.property_path) ?? property_label,
      property_path: last_decision?.property_path ?? null,
      operator: last_decision?.operator ?? null,
      expected_value: formatExpectedValue(last_decision?.value),
      true_path: localNameFromToken(last_decision?.true_path) ?? null,
      false_path: localNameFromToken(last_decision?.false_path) ?? null,
      unknown_path: localNameFromToken(last_decision?.unknown_path) ?? null,
      branch_taken,
      branch_label: describeBranch(last_decision, branch_taken),
      node_type: last_decision?.element_type ?? null,
      expression: last_decision?.expression ?? null,
      terminal_label:
        terminal_element?.label ??
        terminal_id ??
        (typeof input.event.final_status === 'string' ? input.event.final_status : 'End'),
      terminal_output,
      outcome_label: terminal_output
        ? `${terminal_element?.label ?? 'End node'}: ${terminal_output}`
        : typeof input.event.final_status === 'string'
          ? input.event.final_status
          : 'End node reached',
    };
  }

  if (event_type === 'node_visit') {
    const branch_taken = resolveBranchTaken(current_element);
    const property_path =
      typeof input.event.property_path === 'string'
        ? input.event.property_path
        : typeof evidence.property_path === 'string'
          ? evidence.property_path
          : (current_element?.property_path ?? null);

    if (current_node_type === 'derive') {
      const status = typeof input.event.status === 'string' ? input.event.status : null;
      const derive_property_label = localNameFromToken(property_path) ?? property_label;
      const derived_value =
        'derived_value' in evidence ? formatExpectedValue(evidence.derived_value) : null;
      const derived_inputs = formatInputs(evidence.inputs);
      const message =
        typeof evidence.message === 'string'
          ? evidence.message
          : typeof input.event.message === 'string'
            ? input.event.message
            : typeof evidence.reason_code === 'string'
              ? evidence.reason_code
              : null;
      const narration = buildDeriveNarration({
        status,
        property_label: derive_property_label,
        derived_value,
        message,
      });

      return {
        event_type,
        node_id: current_node_id,
        node_label: current_element?.label ?? null,
        sample_target_label,
        target_class_label,
        property_label: derive_property_label,
        property_path,
        operator: null,
        expected_value: null,
        true_path: localNameFromToken(current_element?.true_path) ?? null,
        false_path: null,
        unknown_path: localNameFromToken(current_element?.unknown_path) ?? null,
        branch_taken,
        branch_label: describeBranch(
          current_element,
          branch_taken ?? (status === 'Unknown' ? 'Unknown' : 'True'),
          'derive',
        ),
        node_type: 'derive',
        expression:
          typeof evidence.expression === 'string'
            ? evidence.expression
            : (current_element?.expression ?? null),
        derived_value,
        derived_inputs,
        narration,
        terminal_label: null,
        terminal_output: null,
        outcome_label: derived_inputs ? `${narration} (inputs: ${derived_inputs})` : narration,
      };
    }

    return {
      event_type,
      node_id: current_node_id,
      node_label: current_element?.label ?? null,
      sample_target_label,
      target_class_label,
      property_label,
      property_path,
      operator: current_element?.operator ?? null,
      expected_value: formatExpectedValue(current_element?.value),
      true_path: localNameFromToken(current_element?.true_path) ?? null,
      false_path: localNameFromToken(current_element?.false_path) ?? null,
      unknown_path: localNameFromToken(current_element?.unknown_path) ?? null,
      branch_taken,
      branch_label: describeBranch(current_element, branch_taken),
      node_type: current_node_type,
      expression: current_element?.expression ?? null,
      terminal_label: null,
      terminal_output: null,
      outcome_label: 'check OK',
    };
  }

  return {
    event_type,
    node_id: current_node_id,
    node_label: current_element?.label ?? null,
    sample_target_label,
    target_class_label,
    property_label,
    property_path:
      typeof input.event.property_path === 'string'
        ? input.event.property_path
        : (current_element?.property_path ?? null),
    operator: current_element?.operator ?? null,
    expected_value: formatExpectedValue(current_element?.value),
    true_path: localNameFromToken(current_element?.true_path) ?? null,
    false_path: localNameFromToken(current_element?.false_path) ?? null,
    unknown_path: localNameFromToken(current_element?.unknown_path) ?? null,
    branch_taken: resolveBranchTaken(current_element),
    branch_label: describeBranch(current_element, resolveBranchTaken(current_element)),
    node_type: current_node_type,
    expression: current_element?.expression ?? null,
    terminal_label: null,
    terminal_output: null,
    outcome_label:
      typeof input.event.final_status === 'string' ? input.event.final_status : event_type,
  };
}

function buildConsoleLines(input: {
  diagnostic_run: DiagnosticRunResponse;
  event?: DiagnosticSequenceEvent;
}) {
  const compatibility = input.diagnostic_run.compatibility ?? null;
  const missingTargetClasses = compatibility?.missing_target_classes ?? [];
  const missingProperties = compatibility?.missing_properties ?? [];
  const base = [
    `${input.diagnostic_run.engine.engine} - solver=${input.diagnostic_run.solver} - inference=${input.diagnostic_run.engine.inference}`,
    `Conforms: ${String(input.diagnostic_run.summary.conforms)}`,
    `Targets: total=${input.diagnostic_run.summary.total_targets}, passed=${input.diagnostic_run.summary.passed}, failed=${input.diagnostic_run.summary.failed}, unknown=${input.diagnostic_run.summary.unknown}`,
    ...(compatibility
      ? [
          `Compatibility score: ${compatibility.compatibility_score}`,
          `Missing target classes: ${missingTargetClasses.length}`,
          `Missing properties: ${missingProperties.length}`,
        ]
      : []),
  ];

  const derived = input.diagnostic_run.derived_values ?? [];
  if (derived.length > 0) {
    base.push(`Derived values: ${derived.length}`);
  }
  if (input.diagnostic_run.derived_persisted && input.diagnostic_run.derived_graph_uri) {
    base.push(`Derived graph persisted: ${input.diagnostic_run.derived_graph_uri}`);
  }

  if (!input.event) {
    return [
      ...base,
      ...(input.diagnostic_run.message ? [input.diagnostic_run.message] : []),
      ...(input.diagnostic_run.report_text ?? '')
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean),
    ];
  }

  const eventType =
    typeof input.event.event_type === 'string' ? input.event.event_type : 'diagnostic_event';
  const eventTarget = extractTargetNodeIds(input.event).join(', ');
  const lines = [...base, `Event: ${eventType}${eventTarget ? ` - target=${eventTarget}` : ''}`];

  if (typeof input.event.final_status === 'string') {
    lines.push(`Final status: ${input.event.final_status}`);
  }

  if (typeof input.event.duration_ms === 'number') {
    lines.push(`Duration: ${input.event.duration_ms} ms`);
  }

  return lines;
}

function summarizeNodeResults(node_results: Record<string, NodeEvaluationResult>) {
  return Object.values(node_results).reduce(
    (accumulator, result) => {
      if (result === 'True') accumulator.true_count += 1;
      if (result === 'False') accumulator.false_count += 1;
      if (result === 'Unknown') accumulator.unknown_count += 1;
      if (result !== 'Untouched') accumulator.affected_node_count += 1;
      return accumulator;
    },
    {
      true_count: 0,
      false_count: 0,
      unknown_count: 0,
      affected_node_count: 0,
    },
  );
}

function pickDerivedFields(
  diagnostic_run: DiagnosticRunResponse,
): Pick<ExecutionStep, 'derived_values' | 'derived_graph_uri' | 'derived_persisted'> {
  return {
    derived_values: (diagnostic_run.derived_values ?? []) as DerivedValue[],
    derived_graph_uri: diagnostic_run.derived_graph_uri ?? null,
    derived_persisted: Boolean(diagnostic_run.derived_persisted),
  };
}

export function buildStepDisplay(input: {
  event: DiagnosticSequenceEvent;
  next_event?: DiagnosticSequenceEvent;
  rule_definition?: RuleDefinition | null;
}): StepDisplay {
  return buildStepDisplayInternal({
    event: input.event,
    next_event: input.next_event,
    rule_elements_by_id: buildRuleElementMap(input.rule_definition),
  });
}

function buildStepFromEvent(input: {
  step_index: number;
  runner_item: RuleRunnerItem;
  library_item?: RuleListItem;
  diagnostic_run: DiagnosticRunResponse;
  event: DiagnosticSequenceEvent;
  next_event?: DiagnosticSequenceEvent;
  cumulative_node_results: Record<string, NodeEvaluationResult>;
  rule_definition?: RuleDefinition | null;
}): ExecutionStep {
  const active_node_ids = extractTargetNodeIds(input.event);
  const target_class =
    (typeof input.event.target_class === 'string' && input.event.target_class) ||
    input.library_item?.target_classes?.join(', ') ||
    null;
  const step_display = buildStepDisplayInternal({
    event: input.event,
    next_event: input.next_event,
    rule_elements_by_id: buildRuleElementMap(input.rule_definition),
  });

  return {
    step_index: input.step_index,
    rule_id: input.runner_item.rule_id,
    rule_label: input.runner_item.label,
    solver: input.diagnostic_run.solver,
    target_class,
    summary: summarizeNodeResults(input.cumulative_node_results),
    node_results: { ...input.cumulative_node_results },
    active_node_ids,
    ...pickDerivedFields(input.diagnostic_run),
    console_lines: buildConsoleLines({
      diagnostic_run: input.diagnostic_run,
      event: input.event,
    }),
    raw_json: {
      diagnostic_run: input.diagnostic_run,
      compatibility: input.diagnostic_run.compatibility ?? null,
      event: input.event,
      step_display,
    } satisfies StepRawJson,
  };
}

export function buildAggregateStep(input: {
  step_index: number;
  runner_item: RuleRunnerItem;
  library_item?: RuleListItem;
  diagnostic_run: DiagnosticRunResponse;
}): ExecutionStep {
  const node_results: Record<string, NodeEvaluationResult> = {};

  for (const target of input.diagnostic_run.targets ?? []) {
    const localName = localNameFromToken(target.target_node);
    if (!localName) continue;
    node_results[localName] = normalizeNodeResult(target.status);
  }

  const active_node_ids = Object.keys(node_results);

  return {
    step_index: input.step_index,
    rule_id: input.runner_item.rule_id,
    rule_label: input.runner_item.label,
    solver: input.diagnostic_run.solver,
    target_class: input.library_item?.target_classes?.join(', ') ?? null,
    summary: summarizeNodeResults(node_results),
    node_results,
    active_node_ids,
    ...pickDerivedFields(input.diagnostic_run),
    console_lines: buildConsoleLines({ diagnostic_run: input.diagnostic_run }),
    raw_json: {
      diagnostic_run: input.diagnostic_run,
      compatibility: input.diagnostic_run.compatibility ?? null,
    } satisfies StepRawJson,
  };
}

function buildExecutionStepsFromDiagnosticRun(input: {
  starting_step_index: number;
  runner_item: RuleRunnerItem;
  library_item?: RuleListItem;
  diagnostic_run: DiagnosticRunResponse;
  rule_definition?: RuleDefinition | null;
}) {
  const steps: ExecutionStep[] = [];
  const cumulative_node_results: Record<string, NodeEvaluationResult> = {};
  let stepIndex = input.starting_step_index;
  const sequence_events = input.diagnostic_run.sequence_events ?? [];

  const findNextRelevantEvent = (startIndex: number, event: DiagnosticSequenceEvent) => {
    const current_node_id = localNameFromToken(event.node_id);
    const current_target = localNameFromToken(
      typeof event.sample_target === 'string' ? event.sample_target : event.target_node,
    );

    for (let index = startIndex + 1; index < sequence_events.length; index += 1) {
      const candidate = sequence_events[index];

      if (
        candidate.event_type === 'transition' &&
        localNameFromToken(
          typeof candidate.from_node_id === 'string' ? candidate.from_node_id : null,
        ) === current_node_id
      ) {
        return candidate;
      }

      if (
        candidate.event_type === 'chain_complete' &&
        (!current_target ||
          localNameFromToken(
            typeof candidate.target_node === 'string' ? candidate.target_node : null,
          ) === current_target) &&
        Array.isArray(candidate.node_sequence) &&
        (candidate.node_sequence as string[]).some(
          (node_id) => localNameFromToken(node_id) === current_node_id,
        )
      ) {
        return candidate;
      }
    }

    return undefined;
  };

  for (
    let currentEventIndex = 0;
    currentEventIndex < sequence_events.length;
    currentEventIndex += 1
  ) {
    const event = sequence_events[currentEventIndex];
    const next_event = findNextRelevantEvent(currentEventIndex, event);
    const eventTargetIds = extractTargetNodeIds(event);

    if (event.event_type === 'chain_complete') {
      const localTarget = localNameFromToken(event.target_node);
      if (localTarget) {
        cumulative_node_results[localTarget] = normalizeNodeResult(event.final_status);
      }
    }

    if (eventTargetIds.length === 0) {
      continue;
    }

    steps.push(
      buildStepFromEvent({
        step_index: stepIndex,
        runner_item: input.runner_item,
        library_item: input.library_item,
        diagnostic_run: input.diagnostic_run,
        event,
        next_event,
        cumulative_node_results,
        rule_definition: input.rule_definition,
      }),
    );
    stepIndex += 1;
  }

  if (steps.length === 0) {
    return {
      steps: [
        buildAggregateStep({
          step_index: input.starting_step_index,
          runner_item: input.runner_item,
          library_item: input.library_item,
          diagnostic_run: input.diagnostic_run,
        }),
      ],
      next_step_index: input.starting_step_index + 1,
    };
  }

  return {
    steps,
    next_step_index: stepIndex,
  };
}

export async function buildRuleRunnerExecutionTimeline(input: {
  active_graph_data: BuildingGraphData;
  runner_rule_items: RuleRunnerItem[];
  available_rules: RuleListItem[];
  solver: 'standard' | 'horizontal' | 'vertical';
  chain_derived?: boolean;
}) {
  const steps: ExecutionStep[] = [];
  const runs: StepRawJson[] = [];
  let next_step_index = 0;
  const chain_derived = input.chain_derived ?? true;
  const earlier_rule_ids: string[] = [];

  // Items run sequentially (one awaited iteration per item) so a later rule can
  // read the derived values an earlier rule persisted.
  for (const runner_item of input.runner_rule_items) {
    const library_item = input.available_rules.find((rule) => rule.rule_id === runner_item.rule_id);
    const use_derived_from = earlier_rule_ids.filter((rule_id) => rule_id !== runner_item.rule_id);

    const [diagnostic_run, rule_definition] = await Promise.all([
      runDiagnosticCheck({
        rule_id: runner_item.rule_id,
        graph_id: input.active_graph_data.id,
        options: {
          solver: input.solver,
          ...(chain_derived
            ? {
                persist_derived: true,
                use_derived_from,
              }
            : {}),
        },
      }),
      getRuleOrNull(runner_item.rule_id),
    ]);

    if (chain_derived && !earlier_rule_ids.includes(runner_item.rule_id)) {
      earlier_rule_ids.push(runner_item.rule_id);
    }

    runs.push({
      diagnostic_run,
      compatibility: diagnostic_run.compatibility ?? null,
    });

    const built = buildExecutionStepsFromDiagnosticRun({
      starting_step_index: next_step_index,
      runner_item,
      library_item,
      diagnostic_run,
      rule_definition,
    });

    steps.push(...built.steps);
    next_step_index = built.next_step_index;
  }

  return {
    graph_id: input.active_graph_data.id,
    steps,
    raw_result: {
      graph_id: input.active_graph_data.id,
      graph_uri: input.active_graph_data.graph_uri ?? null,
      runs,
    },
  };
}
