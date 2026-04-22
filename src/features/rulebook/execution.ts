import { getRuleOrNull, runDiagnosticCheck } from './api';
import type {
  BuildingGraphData,
  DiagnosticRunResponse,
  DiagnosticSequenceEvent,
  ExecutionStep,
  NodeEvaluationResult,
  RuleDefinition,
  RuleListItem,
  RuleRunnerItem,
} from './types';

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
    terminal_label?: string | null;
    terminal_output?: string | null;
    outcome_label?: string | null;
  };
};

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

function buildStepDisplay(input: {
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
      return null;
    }

    if (localNameFromToken(element.true_path) === target_node_id) {
      return 'True';
    }
    if (localNameFromToken(element.false_path) === target_node_id) {
      return 'False';
    }
    if (localNameFromToken(element.unknown_path) === target_node_id) {
      return 'Unknown';
    }
    return null;
  };

  if (event_type === 'chain_complete') {
    const node_sequence = Array.isArray(input.event.node_sequence)
      ? (input.event.node_sequence as string[])
      : [];
    const last_decision_id =
      [...node_sequence].reverse().find((node_id) => {
        const element = input.rule_elements_by_id.get(node_id);
        return element?.element_type === 'decision';
      }) ?? null;
    const last_decision = last_decision_id
      ? input.rule_elements_by_id.get(last_decision_id)
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
      expected_value: last_decision?.value == null ? null : String(last_decision.value),
      true_path: localNameFromToken(last_decision?.true_path) ?? null,
      false_path: localNameFromToken(last_decision?.false_path) ?? null,
      unknown_path: localNameFromToken(last_decision?.unknown_path) ?? null,
      branch_taken,
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
      expected_value: current_element?.value == null ? null : String(current_element.value),
      true_path: localNameFromToken(current_element?.true_path) ?? null,
      false_path: localNameFromToken(current_element?.false_path) ?? null,
      unknown_path: localNameFromToken(current_element?.unknown_path) ?? null,
      branch_taken: resolveBranchTaken(current_element),
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
    expected_value: current_element?.value == null ? null : String(current_element.value),
    true_path: localNameFromToken(current_element?.true_path) ?? null,
    false_path: localNameFromToken(current_element?.false_path) ?? null,
    unknown_path: localNameFromToken(current_element?.unknown_path) ?? null,
    branch_taken: resolveBranchTaken(current_element),
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
  const step_display = buildStepDisplay({
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

function buildAggregateStep(input: {
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
}) {
  const steps: ExecutionStep[] = [];
  const runs: StepRawJson[] = [];
  let next_step_index = 0;

  for (const runner_item of input.runner_rule_items) {
    const library_item = input.available_rules.find((rule) => rule.rule_id === runner_item.rule_id);

    const [diagnostic_run, rule_definition] = await Promise.all([
      runDiagnosticCheck({
        rule_id: runner_item.rule_id,
        graph_id: input.active_graph_data.id,
        options: {
          solver: input.solver,
        },
      }),
      getRuleOrNull(runner_item.rule_id),
    ]);

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
