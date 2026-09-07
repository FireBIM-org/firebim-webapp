import { env } from '@/config/env';

import type {
  BuildingGraphData,
  CheckCompatibilityResponse,
  DiagnosticRunResponse,
  CheckRunOptions,
  CheckRunResponse,
  GraphAssertion,
  GraphHealthResponse,
  RuleDefinition,
  RuleHealthResponse,
  RuleListItem,
} from './types';

const ruleDefinitionCache = new Map<string, RuleDefinition>();
const missingRuleDefinitionCache = new Set<string>();

const DEFAULT_CHECK_OPTIONS: Required<CheckRunOptions> = {
  solver: 'standard',
  inference: 'rdfs',
  advanced: true,
  include_report_text: true,
  include_report_graph_ttl: false,
  include_targets: true,
  include_trace: true,
  debug: false,
  persist_derived: false,
  use_derived_from: [],
  target_nodes: [],
  schema: 'auto',
  overrides: [],
  include_questions: true,
};

type DeleteRuleInput = {
  rule_id?: string;
  graph_uri?: string | null;
};

type GraphListApiItem = {
  graph_id: string;
  graph_uri?: string | null;
  label?: string | null;
  /** what the graph says about itself (`<graph_uri> rdfs:comment`), e.g. which rules it is meant for */
  description?: string | null;
  source?: string | null;
  triple_count?: number | null;
};

type GraphFetchApiResponse = {
  success?: boolean;
  graph_id: string;
  graph_uri: string;
  ttl?: string | null;
  nodes?: any[];
  edges?: any[];
  label?: string | null;
  source?: string | null;
  triple_count?: number | null;
};

type PublishRuleJsonResponse = {
  published?: boolean;
  rule_id?: string | null;
  graph_uri?: string | null;
  entry?: string | null;
  element_count?: number | null;
  label?: string | null;
  success?: boolean;
  error?: string | null;
  message?: string | null;
  fallback?: boolean;
  warnings?: string[];
};

type PublishGraphJsonRequest = {
  graph_id: string;
  ttl: string;
};

type PublishGraphJsonResponse = {
  success?: boolean;
  graph_id: string;
  graph_uri: string;
  dataset?: string;
  overwritten?: boolean;
  message?: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function getRuleIdFromGraphUri(graph_uri?: string | null): string | null {
  if (!graph_uri) return null;

  const parts = graph_uri.split('/').filter(Boolean);
  return parts.length > 0 ? parts[parts.length - 1] : null;
}

function normalizeRulePublishPayload(input: unknown): { rule: Record<string, unknown> } {
  if (!isRecord(input)) {
    throw new Error('Rule upload must contain a JSON object.');
  }

  const raw_rule = isRecord(input.rule) ? input.rule : input;
  const { rule_elements, ...rest } = raw_rule;
  const elements = Array.isArray(raw_rule.elements)
    ? raw_rule.elements
    : Array.isArray(rule_elements)
      ? rule_elements
      : undefined;

  return {
    rule: {
      ...rest,
      ...(elements ? { elements } : {}),
    },
  };
}

function normalizeGraphPublishPayload(input: unknown): PublishGraphJsonRequest {
  if (!isRecord(input)) {
    throw new Error('Graph upload must contain a JSON object.');
  }

  const raw_graph = isRecord(input.graph) ? input.graph : input;
  const graph_id =
    typeof raw_graph.graph_id === 'string'
      ? raw_graph.graph_id
      : typeof raw_graph.id === 'string'
        ? raw_graph.id
        : '';
  const ttl = typeof raw_graph.ttl === 'string' ? raw_graph.ttl : '';

  if (!graph_id || !ttl) {
    throw new Error('Graph JSON must include graph_id and ttl.');
  }

  return { graph_id, ttl };
}

function normalizeRuleDefinition(input: unknown): RuleDefinition {
  const raw = (input ?? {}) as Record<string, unknown>;
  const rule =
    raw.rule && typeof raw.rule === 'object' ? (raw.rule as Record<string, unknown>) : raw;

  const raw_rule_elements = Array.isArray(rule.rule_elements)
    ? rule.rule_elements
    : Array.isArray(rule.elements)
      ? rule.elements
      : [];

  return {
    id: String(rule.id ?? ''),
    entry: String(rule.entry ?? ''),
    rule_elements: raw_rule_elements.map((item) => {
      const element = (item ?? {}) as Record<string, unknown>;

      return {
        id: String(element.id ?? ''),
        element_type:
          element.element_type === 'start' ||
          element.element_type === 'decision' ||
          element.element_type === 'end'
            ? element.element_type
            : 'decision',
        target_class: (element.target_class as string | null | undefined) ?? null,
        property_path: (element.property_path as string | null | undefined) ?? null,
        operator: (element.operator as string | null | undefined) ?? null,
        value: element.value,
        true_path: (element.true_path as string | null | undefined) ?? null,
        false_path: (element.false_path as string | null | undefined) ?? null,
        unknown_path: (element.unknown_path as string | null | undefined) ?? null,
        label: (element.label as string | null | undefined) ?? null,
        config: (element.config as Record<string, unknown> | undefined) ?? {},
        graph_uri: (element.graph_uri as string | null | undefined) ?? null,
      };
    }),
  };
}

async function parseJsonResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `HTTP ${response.status}`);
  }

  return response.json() as Promise<T>;
}

async function requestJsonWithFallback<T>(
  attempts: Array<{ url: string; init?: RequestInit }>,
): Promise<T> {
  let last_error: Error | null = null;

  for (const attempt of attempts) {
    try {
      const response = await fetch(attempt.url, attempt.init);
      return await parseJsonResponse<T>(response);
    } catch (error) {
      last_error = error instanceof Error ? error : new Error('Request failed');
    }
  }

  throw last_error ?? new Error('Request failed');
}

function normalizeGraphListItems(input: unknown): GraphListApiItem[] {
  const raw = (input ?? {}) as Record<string, unknown>;
  const items = Array.isArray(raw.graphs)
    ? raw.graphs
    : Array.isArray(raw.items)
      ? raw.items
      : Array.isArray(input)
        ? input
        : [];

  const result: GraphListApiItem[] = [];

  for (const item of items) {
    const graph = (item ?? {}) as Record<string, unknown>;
    const graph_uri =
      (graph.graph_uri as string | undefined) ??
      (typeof item === 'string' ? item : undefined) ??
      null;
    const graph_id =
      (graph.graph_id as string | undefined) ?? getRuleIdFromGraphUri(graph_uri) ?? null;

    if (!graph_id) {
      continue;
    }

    result.push({
      graph_id,
      graph_uri,
      label: (graph.label as string | undefined) ?? (graph.name as string | undefined) ?? graph_id,
      description: (graph.description as string | undefined) ?? null,
      source: (graph.source as string | undefined) ?? (graph_uri ? 'api' : null),
      triple_count: typeof graph.triple_count === 'number' ? graph.triple_count : null,
    });
  }

  return result;
}

function localNameFromToken(token: string): string {
  if (token.includes(':')) {
    return token.split(':').pop() ?? token;
  }

  if (token.includes('#')) {
    return token.split('#').pop() ?? token;
  }

  const parts = token.split('/').filter(Boolean);
  return parts[parts.length - 1] ?? token;
}

function expandPrefixedIri(token: string, prefixes: Record<string, string>): string {
  if (token === 'a') {
    return 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type';
  }

  if (token.startsWith('<') && token.endsWith('>')) {
    return token.slice(1, -1);
  }

  const [prefix, suffix] = token.split(':');
  if (prefix && suffix != null && prefixes[prefix]) {
    return `${prefixes[prefix]}${suffix}`;
  }

  return token;
}

function parseLiteralValue(value: string): unknown {
  const trimmed = value.trim();

  if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
    return trimmed.slice(1, -1);
  }

  if (trimmed === 'true' || trimmed === 'TRUE') return true;
  if (trimmed === 'false' || trimmed === 'FALSE') return false;

  const numeric = Number(trimmed);
  if (!Number.isNaN(numeric)) return numeric;

  return trimmed;
}

function isLikelyLiteral(value: string): boolean {
  const trimmed = value.trim();
  return (
    trimmed.startsWith('"') ||
    /^-?\d+(\.\d+)?$/.test(trimmed) ||
    trimmed === 'true' ||
    trimmed === 'false' ||
    trimmed === 'TRUE' ||
    trimmed === 'FALSE'
  );
}

function kindFromTypeToken(type_token: string): BuildingGraphData['nodes'][number]['kind'] {
  const local_name = localNameFromToken(type_token);

  switch (local_name) {
    case 'Project':
    case 'Site':
    case 'Building':
    case 'Storey':
    case 'Wall':
    case 'Column':
    case 'Beam':
    case 'Floor':
    case 'Ceiling':
    case 'Space':
    case 'Room':
    case 'Room-Furniture':
      return local_name;
    default:
      return 'Room';
  }
}

export function parseBuildingGraphTtl(
  payload: GraphFetchApiResponse,
  ontology_catalog: BuildingGraphData['ontology_catalog'],
): BuildingGraphData {
  if (payload.nodes && payload.nodes.length > 0) {
    return {
      id: payload.graph_id,
      label: payload.label ?? payload.graph_id,
      graph_uri: payload.graph_uri,
      source: payload.source ?? 'api',
      triple_count: payload.triple_count ?? null,
      ttl: payload.ttl ?? null,
      nodes: payload.nodes,
      edges: payload.edges ?? [],
      ontology_catalog,
    };
  }

  if (!payload.ttl) {
    throw new Error('Graph payload must include either ttl or nodes/edges');
  }

  const prefixes = Object.fromEntries(
    Array.from(payload.ttl.matchAll(/PREFIX\s+([A-Za-z][\w-]*):\s*<([^>]+)>/g)).map((match) => [
      match[1],
      match[2],
    ]),
  );

  const nodes = new Map<string, BuildingGraphData['nodes'][number]>();
  const edges = new Map<string, BuildingGraphData['edges'][number]>();

  const statement_regex = /([^\s;]+)\s+a\s+([^\s;]+)\s*;([\s\S]*?)\./g;
  const statements = Array.from(payload.ttl.matchAll(statement_regex));

  for (const statement of statements) {
    const subject_token = statement[1]?.trim();
    const type_token = statement[2]?.trim();
    const body = statement[3] ?? '';

    if (!subject_token || !type_token) continue;

    const subject_id = localNameFromToken(subject_token);
    const kind = kindFromTypeToken(type_token);

    const existing = nodes.get(subject_id);
    nodes.set(subject_id, {
      id: subject_id,
      kind,
      label: subject_id,
      parent_id: existing?.parent_id ?? null,
      metadata: { ...(existing?.metadata ?? {}) },
    });

    const predicate_parts = body
      .split(';')
      .map((part) => part.trim())
      .filter(Boolean);

    for (const part of predicate_parts) {
      const first_space_index = part.search(/\s/);
      if (first_space_index === -1) continue;

      const predicate_token = part.slice(0, first_space_index).trim();
      const object_chunk = part.slice(first_space_index).trim();
      if (!predicate_token || !object_chunk) continue;

      const predicate_iri = expandPrefixedIri(predicate_token, prefixes);
      const relation = localNameFromToken(predicate_token);
      const objects = object_chunk
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);

      for (const object_token of objects) {
        if (isLikelyLiteral(object_token)) {
          const node = nodes.get(subject_id);
          if (!node) continue;

          nodes.set(subject_id, {
            ...node,
            metadata: {
              ...(node.metadata ?? {}),
              [predicate_iri]: parseLiteralValue(object_token),
            },
          });
          continue;
        }

        const target_id = localNameFromToken(object_token);
        const edge_id = `${subject_id}-${relation}-${target_id}`;

        edges.set(edge_id, {
          id: edge_id,
          source: subject_id,
          target: target_id,
          relation,
        });

        const target_node = nodes.get(target_id);
        nodes.set(target_id, {
          id: target_id,
          kind: target_node?.kind ?? 'Room',
          label: target_id,
          parent_id:
            target_node?.parent_id ??
            (relation === 'hasRoom' || relation === 'contains' ? subject_id : null),
          metadata: { ...(target_node?.metadata ?? {}) },
        });
      }
    }
  }

  return {
    id: payload.graph_id,
    label: payload.label ?? payload.graph_id,
    graph_uri: payload.graph_uri,
    source: payload.source ?? 'api',
    triple_count: payload.triple_count ?? null,
    ttl: payload.ttl,
    nodes: Array.from(nodes.values()),
    edges: Array.from(edges.values()),
    ontology_catalog,
  };
}

export async function getRulesHealth(): Promise<RuleHealthResponse> {
  const res = await fetch(`${env.apiBaseUrl}/rules/health`);

  if (!res.ok) {
    throw new Error(`Rules health failed: ${res.status}`);
  }

  return res.json();
}

/** "Start: Flow-UseCategory" → "Flow-UseCategory" (the API does the same when a rule has no title). */
export function displayRuleTitle(label: string | null | undefined): string | null {
  if (!label) return null;
  const text = label.trim();
  const match = /^start\s*[:\-–]\s*(.+)$/i.exec(text);
  return (match ? match[1] : text).trim() || null;
}

export async function listRules(): Promise<RuleListItem[]> {
  const res = await fetch(`${env.apiBaseUrl}/rules/list`);

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`List rules failed: ${res.status} ${text}`);
  }

  const data = await res.json();

  const items = Array.isArray(data)
    ? data
    : Array.isArray(data?.items)
      ? data.items
      : Array.isArray(data?.rules)
        ? data.rules
        : Array.isArray(data?.graph_uris)
          ? data.graph_uris.map((graph_uri: string) => ({ graph_uri }))
          : [];

  return items.map((item: unknown, index: number) => {
    const raw = (item ?? {}) as Record<string, unknown>;
    const graph_uri =
      (raw.graph_uri as string | undefined) ??
      (typeof item === 'string' ? item : undefined) ??
      null;

    const rule_id =
      (raw.rule_id as string | undefined) ??
      (raw.id as string | undefined) ??
      getRuleIdFromGraphUri(graph_uri) ??
      `rule-${index}`;

    const start_label =
      (raw.label as string | undefined) ?? (raw.name as string | undefined) ?? null;
    return {
      rule_id,
      label: (raw.title as string | undefined) ?? displayRuleTitle(start_label) ?? rule_id,
      start_label,
      graph_uri,
      source: raw.source === 'example' ? 'example' : 'api',
      entry: (raw.entry as string | undefined) ?? null,
      rule_element_count:
        typeof raw.rule_element_count === 'number'
          ? raw.rule_element_count
          : typeof raw.element_count === 'number'
            ? raw.element_count
            : null,
      target_classes: Array.isArray(raw.target_classes) ? (raw.target_classes as string[]) : [],
      description: (raw.description as string | undefined) ?? null,
    };
  });
}

export async function getRule(rule_id: string): Promise<RuleDefinition> {
  const cached = ruleDefinitionCache.get(rule_id);
  if (cached) {
    return cached;
  }

  const res = await fetch(`${env.apiBaseUrl}/rules/${rule_id}`);
  const data = await parseJsonResponse<unknown>(res);
  const normalized = normalizeRuleDefinition(data);
  ruleDefinitionCache.set(rule_id, normalized);
  missingRuleDefinitionCache.delete(rule_id);
  return normalized;
}

export async function getRuleOrNull(rule_id: string): Promise<RuleDefinition | null> {
  const cached = ruleDefinitionCache.get(rule_id);
  if (cached) {
    return cached;
  }

  if (missingRuleDefinitionCache.has(rule_id)) {
    return null;
  }

  const res = await fetch(`${env.apiBaseUrl}/rules/${rule_id}`);

  if (res.status === 404) {
    missingRuleDefinitionCache.add(rule_id);
    return null;
  }

  const data = await parseJsonResponse<unknown>(res);
  const normalized = normalizeRuleDefinition(data);
  ruleDefinitionCache.set(rule_id, normalized);
  missingRuleDefinitionCache.delete(rule_id);
  return normalized;
}

export async function deleteRule(
  input: DeleteRuleInput,
): Promise<{ deleted: boolean; rule_id?: string; graph_uri?: string | null }> {
  const rule_id = input.rule_id ?? getRuleIdFromGraphUri(input.graph_uri);

  if (!rule_id) {
    throw new Error('Delete rule failed: missing rule_id');
  }

  const res = await fetch(`${env.apiBaseUrl}/rules/delete`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      rule_id,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Delete rule failed: ${res.status} ${text}`);
  }

  const data = (await res.json()) as Record<string, unknown>;

  return {
    deleted: Boolean(data.deleted ?? data.success ?? true),
    rule_id: (data.rule_id as string | undefined) ?? rule_id,
    graph_uri: (data.graph_uri as string | null | undefined) ?? input.graph_uri ?? null,
  };
}

export async function publishRuleJson(input: unknown): Promise<PublishRuleJsonResponse> {
  const res = await fetch(`${env.apiBaseUrl}/rules/publish`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(normalizeRulePublishPayload(input)),
  });

  return parseJsonResponse<PublishRuleJsonResponse>(res);
}

export type GraphAnswersResponse = {
  success: boolean;
  graph_id: string;
  graph_uri: string;
  base_graph_id: string;
  created: boolean;
  applied: number;
  triple_count: number;
  message: string;
};

/** Write answers into the answered copy of a graph (`<graph_id>--answered`; created on the first call). */
export async function answerBuildingGraph(input: {
  graph_id: string;
  assertions: GraphAssertion[];
  answered_graph_id?: string | null;
}): Promise<GraphAnswersResponse> {
  const res = await fetch(
    `${env.apiBaseUrl}/graphs/${encodeURIComponent(input.graph_id)}/answers`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        assertions: input.assertions,
        ...(input.answered_graph_id ? { answered_graph_id: input.answered_graph_id } : {}),
      }),
    },
  );
  return parseJsonResponse<GraphAnswersResponse>(res);
}

export async function getGraphsHealth(): Promise<GraphHealthResponse> {
  return requestJsonWithFallback<GraphHealthResponse>([{ url: `${env.apiBaseUrl}/graphs/health` }]);
}

export async function publishBuildingGraphJson(input: unknown): Promise<PublishGraphJsonResponse> {
  const res = await fetch(`${env.apiBaseUrl}/graphs/publish`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(normalizeGraphPublishPayload(input)),
  });

  return parseJsonResponse<PublishGraphJsonResponse>(res);
}

export async function listStoredBuildingGraphs(): Promise<GraphListApiItem[]> {
  const data = await requestJsonWithFallback<unknown>([
    { url: `${env.apiBaseUrl}/graphs` },
    { url: `${env.apiBaseUrl}/graphs/list` },
  ]);

  return normalizeGraphListItems(data);
}

export async function fetchStoredBuildingGraphRaw(
  graph_id: string,
): Promise<GraphFetchApiResponse> {
  return requestJsonWithFallback<GraphFetchApiResponse>([
    { url: `${env.apiBaseUrl}/graphs/${graph_id}` },
    {
      url: `${env.apiBaseUrl}/graphs/fetch`,
      init: {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ graph_id }),
      },
    },
  ]);
}

export async function runBackendCheck(input: {
  rule_id: string;
  graph_id: string;
  options?: CheckRunOptions;
}): Promise<CheckRunResponse> {
  const res = await fetch(`${env.apiBaseUrl}/checks/run`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      rule_id: input.rule_id,
      graph_id: input.graph_id,
      options: {
        ...DEFAULT_CHECK_OPTIONS,
        ...(input.options ?? {}),
      },
    }),
  });

  return parseJsonResponse<CheckRunResponse>(res);
}

export async function runCompatibilityCheck(input: {
  rule_id: string;
  graph_id: string;
}): Promise<CheckCompatibilityResponse> {
  const res = await fetch(`${env.apiBaseUrl}/checks/compatibility`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      rule_id: input.rule_id,
      graph_id: input.graph_id,
    }),
  });

  return parseJsonResponse<CheckCompatibilityResponse>(res);
}

export async function runDiagnosticCheck(input: {
  rule_id: string;
  graph_id: string;
  options?: CheckRunOptions;
}): Promise<DiagnosticRunResponse> {
  const res = await fetch(`${env.apiBaseUrl}/checks/run-diagnostic`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      rule_id: input.rule_id,
      graph_id: input.graph_id,
      options: {
        ...DEFAULT_CHECK_OPTIONS,
        include_targets: true,
        include_trace: true,
        debug: true,
        ...(input.options ?? {}),
      },
    }),
  });

  return parseJsonResponse<DiagnosticRunResponse>(res);
}
