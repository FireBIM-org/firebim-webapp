import { env } from '@/config/env';

export type RuleHealthResponse = {
  status?: string;
  ok?: boolean;
};

export type RuleElementType = 'start' | 'decision' | 'end';
export type RuleBranch = 'true_path' | 'false_path' | 'unknown_path';
type ApiRuleBranch = 'true' | 'false' | 'unknown';

export type RuleElementListItem = {
  element_id?: string;
  id?: string;
  graph_uri?: string;
  element_type?: RuleElementType;
};

export type RuleElementJson = {
  id: string;
  element_type: RuleElementType;
  target_class?: string | null;
  property_path?: string | null;
  operator?: string | null;
  value?: unknown;
  true_path?: string | null;
  false_path?: string | null;
  unknown_path?: string | null;
  label?: string | null;
  config?: Record<string, unknown>;
  graph_uri?: string | null;
  element_id?: string | null;
};

export type RuleElementPayload = RuleElementJson;

export type RuleJson = {
  id: string;
  entry: string;
  elements: RuleElementPayload[];
};

export type PublishRuleElementResponse = {
  published?: boolean;
  element_id?: string;
  graph_uri?: string;
  element_type?: RuleElementType;
  success?: boolean;
  fallback?: boolean;
  error?: string | null;
};

export type DeleteRuleElementRequest = {
  element_id?: string;
  graph_uri?: string;
};

export type DeleteRuleElementResponse = {
  deleted: boolean;
  element_id?: string;
  graph_uri?: string;
};

export async function deleteRuleElement(
  payload: DeleteRuleElementRequest
): Promise<DeleteRuleElementResponse> {
  const elementId = payload.element_id || payload.graph_uri?.split('/').pop();

  if (!elementId) {
    throw new Error('Delete rule element failed: missing element_id');
  }

  const res = await fetch(`${env.apiBaseUrl}/rules/rule-elements/delete`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ element_id: elementId }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Delete rule element failed: ${res.status} ${text}`);
  }

  return res.json();
}

export type DetailedRuleElementListItem = {
  item_id: string;
  element_id: string;
  graph_uri: string;
  element_type: RuleElementType;
  label: string;
};

export type ConnectRuleRequest = {
  rule: RuleJson;
  source_id: string;
  branch: RuleBranch;
  target_id: string;
};

export type ConnectRuleResponse = {
  updated: boolean;
  overwritten: boolean;
  previous_target_id?: string | null;
  rule: RuleJson;
};

export type DisconnectRuleRequest = {
  rule: RuleJson;
  source_id: string;
  branch: RuleBranch;
};

export type DisconnectRuleResponse = {
  updated: boolean;
  previous_target_id?: string | null;
  rule: RuleJson;
};

export type CheckRuleCompletenessRequest = {
  rule: RuleJson;
};

export type CheckRuleCompletenessResponse = {
  complete: boolean;
  open: boolean;
  broken: boolean;
  entry_ok: boolean;
  missing_entry: boolean;
  missing_nodes: string[];
  open_branches: Array<{
    node_id?: string;
    branch?: RuleBranch | string;
    [key: string]: unknown;
  }>;
  errors: string[];
  success?: boolean;
  fallback?: boolean;
};

export type PublishRuleRequest = {
  rule: RuleJson;
};

export type PublishRuleResponse = {
  published?: boolean;
  rule_id?: string;
  graph_uri?: string;
  entry?: string;
  element_count?: number;
  success?: boolean;
  error?: string | null;
  fallback?: boolean;
};

export type EnsureRuleElementsResult = {
  createdIds: string[];
  existingIds: string[];
};

export const EXAMPLE_RULE_ELEMENTS: RuleElementJson[] = [
  {
    id: 'decision-example-room-area',
    element_type: 'decision',
    target_class: 'Room',
    property_path: 'http://example.org/fbo/1.0/roomArea',
    operator: '>',
    value: 120,
    true_path: null,
    false_path: null,
    unknown_path: null,
    label: 'Example rule element',
    config: {
      library_category: 'Examples',
    },
    graph_uri: null,
    element_id: null,
  },
  {
    id: 'start-example',
    element_type: 'start',
    target_class: null,
    property_path: null,
    operator: null,
    value: null,
    true_path: null,
    false_path: null,
    unknown_path: null,
    label: 'Example start rule element - this name will be used for the entire rule',
    config: {
      library_category: 'Examples',
    },
    graph_uri: null,
    element_id: null,
  },
  {
    id: 'end-example-pass',
    element_type: 'end',
    target_class: null,
    property_path: null,
    operator: null,
    value: 'The rule passed',
    true_path: null,
    false_path: null,
    unknown_path: null,
    label: 'Example end rule element — Passed',
    config: {
      library_category: 'Examples',
      end_kind: 'output',
      output_text: 'The rule passed',
    },
    graph_uri: null,
    element_id: null,
  },
  {
    id: 'end-example-fail',
    element_type: 'end',
    target_class: null,
    property_path: null,
    operator: null,
    value: 'The rule did not pass',
    true_path: null,
    false_path: null,
    unknown_path: null,
    label: 'Example end rule element — Failed',
    config: {
      library_category: 'Examples',
      end_kind: 'output',
      output_text: 'The rule did not pass',
    },
    graph_uri: null,
    element_id: null,
  },
  {
    id: 'end-example-missing-data',
    element_type: 'end',
    target_class: null,
    property_path: null,
    operator: null,
    value: 'The rule is missing data and cannot be evaluated',
    true_path: null,
    false_path: null,
    unknown_path: null,
    label: 'Example end rule element — Missing data',
    config: {
      library_category: 'Examples',
      end_kind: 'output',
      output_text: 'The rule is missing data and cannot be evaluated',
    },
    graph_uri: null,
    element_id: null,
  },
];

function normalizeRuleElement(input: unknown): RuleElementJson {
  const raw = (input ?? {}) as Record<string, unknown>;
  const ruleElement =
    raw.rule_element && typeof raw.rule_element === 'object'
      ? (raw.rule_element as Record<string, unknown>)
      : raw.element && typeof raw.element === 'object'
      ? (raw.element as Record<string, unknown>)
      : raw;

  const id = String(ruleElement.id ?? raw.element_id ?? '');
  const elementType =
    ruleElement.element_type === 'start' ||
    ruleElement.element_type === 'decision' ||
    ruleElement.element_type === 'end'
      ? ruleElement.element_type
      : ruleElement.node_type === 'start' ||
        ruleElement.node_type === 'decision' ||
        ruleElement.node_type === 'end'
      ? ruleElement.node_type
      : 'decision';

  return {
    id,
    element_id: String((raw.element_id ?? ruleElement.element_id ?? id) || ''),
    element_type: elementType,
    target_class: (ruleElement.target_class as string | null | undefined) ?? null,
    property_path: (ruleElement.property_path as string | null | undefined) ?? null,
    operator: (ruleElement.operator as string | null | undefined) ?? null,
    value: ruleElement.value,
    true_path: (ruleElement.true_path as string | null | undefined) ?? null,
    false_path: (ruleElement.false_path as string | null | undefined) ?? null,
    unknown_path: (ruleElement.unknown_path as string | null | undefined) ?? null,
    label: (ruleElement.label as string | null | undefined) ?? null,
    config: (ruleElement.config as Record<string, unknown> | undefined) ?? {},
    graph_uri: (raw.graph_uri as string | null | undefined) ??
      (ruleElement.graph_uri as string | null | undefined) ??
      null,
  };
}

async function parseJsonResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `HTTP ${response.status}`);
  }

  return response.json() as Promise<T>;
}

export async function getRulesHealth(): Promise<RuleHealthResponse> {
  const res = await fetch(`${env.apiBaseUrl}/rules/health`);
  if (!res.ok) {
    throw new Error(`Rules health failed: ${res.status}`);
  }
  return res.json();
}

export async function connectRuleElementBranch(
  payload: ConnectRuleRequest
): Promise<ConnectRuleResponse> {
  const apiBranch: ApiRuleBranch =
    payload.branch === 'true_path'
      ? 'true'
      : payload.branch === 'false_path'
      ? 'false'
      : 'unknown';

  const res = await fetch(`${env.apiBaseUrl}/rules/connect`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      ...payload,
      branch: apiBranch,
    }),
  });

  const data = await parseJsonResponse<Record<string, unknown>>(res);

  return {
    updated: Boolean(data.updated),
    overwritten: Boolean(data.overwritten),
    previous_target_id: (data.previous_target_id as string | null | undefined) ?? null,
    rule: (data.rule as RuleJson | undefined) ?? payload.rule,
  };
}

export async function checkRuleCompleteness(
  payload: CheckRuleCompletenessRequest
): Promise<CheckRuleCompletenessResponse> {
  const res = await fetch(`${env.apiBaseUrl}/rules/check-completeness`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  return parseJsonResponse<CheckRuleCompletenessResponse>(res);
}

export async function publishRule(
  payload: PublishRuleRequest
): Promise<PublishRuleResponse> {
  const res = await fetch(`${env.apiBaseUrl}/rules/publish`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  return parseJsonResponse<PublishRuleResponse>(res);
}

export async function listRuleElements(): Promise<RuleElementListItem[]> {
  const res = await fetch(`${env.apiBaseUrl}/rules/rule-elements`);

  if (!res.ok) {
    console.error(`List rule elements failed: ${res.status}`);
    return [];
  }

  const data = await res.json();

  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.items)) return data.items;
  if (Array.isArray(data?.rule_elements)) return data.rule_elements;

  if (Array.isArray(data?.graph_uris)) {
    return data.graph_uris.map((graphUri: string) => {
      const parts = graphUri.split('/');
      const id = parts[parts.length - 1] || graphUri;

      return {
        element_id: id,
        graph_uri: graphUri,
        element_type: 'decision' as const,
      };
    });
  }

  return [];
}

export async function getRuleElement(
  id: string
): Promise<{ rule_element: RuleElementJson }> {
  const res = await fetch(`${env.apiBaseUrl}/rules/rule-elements/${id}`);
  const data = await parseJsonResponse<Record<string, unknown>>(res);

  const rawRuleElement = data?.rule_element ?? data;
  const normalized = normalizeRuleElement(rawRuleElement);

  return {
    rule_element: {
      ...normalized,
      graph_uri:
        (data.graph_uri as string | null | undefined) ?? normalized.graph_uri ?? null,
    },
  };
}

export async function getRuleElementOrNull(
  id: string
): Promise<{ rule_element: RuleElementJson } | null> {
  const res = await fetch(`${env.apiBaseUrl}/rules/rule-elements/${id}`);

  if (res.status === 404) {
    return null;
  }

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Get rule element failed: ${res.status} ${text}`);
  }

  const data = await res.json();
  const rawRuleElement = data?.rule_element ?? data;
  const normalized = normalizeRuleElement(rawRuleElement);

  return {
    rule_element: {
      ...normalized,
      graph_uri: data?.graph_uri ?? normalized.graph_uri ?? null,
    },
  };
}

export async function listRuleElementsDetailed(): Promise<DetailedRuleElementListItem[]> {
  const basic = await listRuleElements();
  const detailed: DetailedRuleElementListItem[] = [];

  for (let index = 0; index < basic.length; index += 1) {
    const item = basic[index];
    const id = item.element_id || item.id || `rule-element-${index}`;

    try {
      const res = await getRuleElement(id);
      const ruleElement = res.rule_element;

      detailed.push({
        item_id: `api:${id}`,
        element_id: id,
        graph_uri: item.graph_uri || ruleElement.graph_uri || '',
        element_type: ruleElement.element_type,
        label: ruleElement.label || ruleElement.id || id,
      });
    } catch {
      detailed.push({
        item_id: `api:${id}`,
        element_id: id,
        graph_uri: item.graph_uri || '',
        element_type:
          item.element_type === 'start' || item.element_type === 'end'
            ? item.element_type
            : 'decision',
        label: id,
      });
    }
  }

  return detailed;
}

export async function publishRuleElement(
  payload: RuleElementJson
): Promise<PublishRuleElementResponse> {
  const res = await fetch(`${env.apiBaseUrl}/rules/rule-elements`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  return parseJsonResponse<PublishRuleElementResponse>(res);
}

export async function deriveRuleElement(payload: {
  source_id: string;
  new_id: string;
  preserve_paths?: boolean;
  overrides?: Record<string, unknown>;
  source_graph_uri?: string | null;
}): Promise<{ rule_element: RuleElementJson }> {
  const res = await fetch(`${env.apiBaseUrl}/rules/rule-elements/derive`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const data = await parseJsonResponse<unknown>(res);
  return { rule_element: normalizeRuleElement(data) };
}

export async function ensureExampleRuleElements(): Promise<EnsureRuleElementsResult> {
  const createdIds: string[] = [];
  const existingIds: string[] = [];

  for (const example of EXAMPLE_RULE_ELEMENTS) {
    const existing = await getRuleElementOrNull(example.id);

    if (existing?.rule_element) {
      existingIds.push(example.id);
      continue;
    }

    await publishRuleElement({
      ...example,
      element_id: null,
      graph_uri: null,
      true_path: null,
      false_path: null,
      unknown_path: null,
    });

    createdIds.push(example.id);
  }

  return {
    createdIds,
    existingIds,
  };
}

// Backward-compatible aliases while the page is being cleaned up.
export const getRuleElementJson = getRuleElement;
export const getRuleElementJsonOrNull = getRuleElementOrNull;
export const connectRulesetNode = connectRuleElementBranch;
export const checkRulesetCompleteness = checkRuleCompleteness;
export const publishRuleset = publishRule;
export const connectRules = connectRuleElementBranch;
export const checkRulesCompleteness = checkRuleCompleteness;
