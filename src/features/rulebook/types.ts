import type { components } from '@/types/api';

export type RuleHealthResponse = {
  status?: string;
  ok?: boolean;
};

export type RuleElementType = 'start' | 'decision' | 'end' | 'derive';

export type RuleListItem = {
  rule_id: string;
  /** Human-facing name (the API's title; falls back to the start label without "Start:"). */
  label: string;
  /** The start element's raw label, kept for reference. */
  start_label?: string | null;
  graph_uri?: string | null;
  source: 'api' | 'example';
  entry?: string | null;
  rule_element_count?: number | null;
  target_classes?: string[];
  description?: string | null;
};

export type RuleDefinition = {
  id: string;
  entry: string;
  rule_elements: Array<{
    id: string;
    element_type: RuleElementType;
    target_class?: string | null;
    property_path?: string | null;
    operator?: string | null;
    value?: unknown;
    expression?: string | null;
    true_path?: string | null;
    false_path?: string | null;
    unknown_path?: string | null;
    label?: string | null;
    config?: Record<string, unknown>;
    graph_uri?: string | null;
  }>;
};

export type RuleBookCategory = {
  id: string;
  label: string;
  system?: boolean;
};

export type RuleBookLibraryState = {
  categories: RuleBookCategory[];
  rule_category_map: Record<string, string>;
  custom_rule_labels: Record<string, string>;
  trashed_rule_ids: string[];
};

export type RuleLibrarySelection = Record<string, boolean>;

export type RuleRunnerItem = {
  runner_item_id: string;
  rule_id: string;
  label: string;
  graph_uri?: string | null;
  /** Set on items the runner added itself because an earlier rule's end element links to this rule. */
  chained_from?: { rule_id: string; end_node_id: string } | null;
  /** Only these targets are evaluated (the ones that reached the linking end element). */
  target_nodes?: string[];
};

export type BuildingGraphTargetClass =
  | 'Project'
  | 'Site'
  | 'Building'
  | 'Storey'
  | 'Wall'
  | 'Column'
  | 'Beam'
  | 'Floor'
  | 'Ceiling'
  | 'Space'
  | 'Room'
  | 'Room-Furniture';

export type BuildingGraphPropertyType = 'string' | 'number' | 'boolean' | 'integer' | 'iri';

export type BuildingGraphPropertyDefinition = {
  property_path: string;
  property_type: BuildingGraphPropertyType;
  label: string;
};

export type BuildingGraphNode = {
  id: string;
  kind: BuildingGraphTargetClass;
  label: string;
  parent_id?: string | null;
  metadata?: Record<string, unknown>;
};

export type BuildingGraphEdge = {
  id: string;
  source: string;
  target: string;
  relation: string;
};

export type BuildingGraphData = {
  id: string;
  label: string;
  graph_uri?: string | null;
  source?: string | null;
  triple_count?: number | null;
  ttl?: string | null;
  nodes: BuildingGraphNode[];
  edges: BuildingGraphEdge[];
  ontology_catalog: Record<BuildingGraphTargetClass, BuildingGraphPropertyDefinition[]>;
};

export type GraphHealthResponse = {
  status?: string;
  graph_uri_example?: string;
};

/** A fact a person asserts about the building graph: `subject property value`. */
export type GraphAssertion = {
  subject: string;
  property: string;
  value: unknown;
  datatype?: string | null;
  replace?: boolean;
};

/** What a rule would need to know about one target to get past an Unknown (from the API). */
export type CheckQuestion = {
  target_node: string;
  node_id: string;
  node_type: 'decision' | 'derive' | string;
  label?: string | null;
  property_path: string;
  operator?: string | null;
  value?: unknown;
  reason_code?: string | null;
  message?: string | null;
  kind: 'boolean' | 'choice' | 'number' | 'text' | string;
  options: unknown[];
  current_value?: unknown;
  write_subject?: string | null;
  write_property?: string | null;
  problem?: string | null;
};

/** A question as the Rule Runner shows it: which run asked it. */
export type OpenQuestion = CheckQuestion & {
  rule_id: string;
  rule_label: string;
  runner_item_id: string;
  /** stable key: write_subject|write_property (or target|path when the answer cannot be written) */
  key: string;
};

export type CheckRunOptions = {
  solver?: 'standard' | 'horizontal' | 'vertical';
  inference?: 'none' | 'rdfs' | 'owlrl' | 'both';
  advanced?: boolean;
  include_report_text?: boolean;
  include_report_graph_ttl?: boolean;
  include_targets?: boolean;
  include_trace?: boolean;
  debug?: boolean;
  persist_derived?: boolean;
  use_derived_from?: string[];
  target_nodes?: string[];
  schema?: string;
  overrides?: GraphAssertion[];
  include_questions?: boolean;
};

export type DerivedValue = components['schemas']['CheckDerivedValue'];

export type CheckTargetTraceItem = {
  step_index?: number;
  source_shape?: string | null;
  result_path?: string | null;
  message?: string | null;
  status?: string | null;
};

export type CheckTargetResult = {
  target_node: string;
  target_class?: string | null;
  status: string;
  message?: string | null;
  terminal_node_id?: string | null;
  trace?: CheckTargetTraceItem[];
};

export type CheckRunSummary = {
  total_targets: number;
  passed: number;
  failed: number;
  unknown: number;
  conforms: boolean;
};

export type CheckRunEngineInfo = {
  engine: string;
  inference: string;
  advanced: boolean;
};

export type CheckRunResponse = {
  success: boolean;
  error?: string | null;
  message?: string | null;
  fallback?: boolean;
  rule_id: string;
  graph_id: string;
  summary: CheckRunSummary;
  engine: CheckRunEngineInfo;
  targets: CheckTargetResult[];
  report_text?: string | null;
  report_graph_ttl?: string | null;
  debug?: Record<string, unknown>;
  derived_values?: DerivedValue[];
  derived_graph_uri?: string | null;
  derived_persisted?: boolean;
  questions?: CheckQuestion[];
  end_nodes?: Array<{
    end_node_id: string;
    terminal_value?: string | null;
    terminal_kind?: string | null;
    label?: string | null;
    output_text?: string | null;
    next_rule?: string | null;
    count?: number;
  }>;
};

export type DiagnosticSequenceEvent = {
  step_index?: number;
  node_id?: string | null;
  node_type?: string | null;
  status?: string | null;
  next_node_id?: string | null;
  evidence?: Record<string, unknown> | null;
  value?: unknown;
  target_node?: string | null;
  target_class?: string | null;
  final_status?: string | null;
  message?: string | null;
  terminal_node_id?: string | null;
  tracer?: unknown;
  [key: string]: unknown;
};

export type DiagnosticTimingMap = Record<string, number | string | boolean | null>;

export type DiagnosticRunResponse = CheckRunResponse & {
  solver: 'standard' | 'horizontal' | 'vertical';
  compatibility?: CheckCompatibilityResponse | null;
  timings?: DiagnosticTimingMap;
  sequence_events?: DiagnosticSequenceEvent[];
  completed_chains?: Array<Record<string, unknown>>;
  engine: CheckRunEngineInfo & {
    diagnostics_enabled?: boolean;
  };
};

export type CompatibilityMatch = {
  value: string;
  count?: number | null;
};

export type CompatibilityWarning = {
  code: string;
  message: string;
};

export type CheckCompatibilityResponse = {
  success: boolean;
  error?: string | null;
  message?: string | null;
  fallback?: boolean;
  rule_id: string;
  graph_id: string;
  compatibility_score: number;
  target_classes_required: string[];
  properties_required: string[];
  target_classes_found: CompatibilityMatch[];
  properties_found: CompatibilityMatch[];
  missing_target_classes: string[];
  missing_properties: string[];
  graph_classes_unused_by_rule: CompatibilityMatch[];
  graph_properties_unused_by_rule: CompatibilityMatch[];
  warnings: CompatibilityWarning[];
};

export type NodeEvaluationResult = 'True' | 'False' | 'Unknown' | 'Untouched';

export type ExecutionStep = {
  step_index: number;
  rule_id: string;
  rule_label: string;
  solver?: 'standard' | 'horizontal' | 'vertical';
  target_class?: string | null;
  summary: {
    true_count: number;
    false_count: number;
    unknown_count: number;
    affected_node_count: number;
  };
  node_results: Record<string, NodeEvaluationResult>;
  console_lines: string[];
  active_node_ids?: string[];
  derived_values?: DerivedValue[];
  derived_graph_uri?: string | null;
  derived_persisted?: boolean;
  raw_json?: unknown;
};

export type ExecutionTimeline = {
  graph_id: string;
  steps: ExecutionStep[];
  raw_result?: unknown;
  /** Open questions (Unknown targets) collected over every run of the timeline. */
  questions?: OpenQuestion[];
};
