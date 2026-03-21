import { env } from '@/config/env';

export type RuleHealthResponse = {
  status?: string;
  ok?: boolean;
};

export type RuleNodeType = 'start' | 'decision' | 'end';
export type RuleBranch = 'true_path' | 'false_path' | 'unknown_path';

export type RuleElementListItem = {
  element_id?: string;
  id?: string;
  graph_uri?: string;
  node_type?: RuleNodeType;
};

export type RuleElementJson = {
  id: string;
  node_type: RuleNodeType;
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
};

export type RuleNodePayload = {
  id: string;
  node_type: RuleNodeType;
  target_class?: string | null;
  property_path?: string | null;
  operator?: string | null;
  value?: unknown;
  true_path?: string | null;
  false_path?: string | null;
  unknown_path?: string | null;
  label?: string | null;
  config?: Record<string, unknown>;
};

export type RuleSetDraft = {
  id: string;
  entry: string;
  nodes: RuleNodePayload[];
};

export type PublishRuleElementResponse = {
  published?: boolean;
  element_id?: string;
  graph_uri?: string;
  node_type?: string;
};

export type DeleteRuleElementRequest = {
  graph_uri: string;
};

export type DeleteRuleElementResponse = {
  deleted: boolean;
  graph_uri: string;
};

export type DetailedRuleElementListItem = {
  item_id: string;
  element_id: string;
  graph_uri: string;
  node_type: RuleNodeType;
  label: string;
};

export type ConnectRulesRequest = {
  ruleset: RuleSetDraft;
  source_id: string;
  branch: RuleBranch;
  target_id: string;
};

export type ConnectRulesResponse = {
  updated: boolean;
  overwritten: boolean;
  previous_target_id?: string | null;
  ruleset: RuleSetDraft;
};

export type DisconnectRulesRequest = {
  ruleset: RuleSetDraft;
  source_id: string;
  branch: RuleBranch;
};

export type DisconnectRulesResponse = {
  updated: boolean;
  previous_target_id?: string | null;
  ruleset: RuleSetDraft;
};

export type CheckRulesCompletenessRequest = {
  ruleset: RuleSetDraft;
};

export type CheckRulesCompletenessResponse = {
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
};

export type EnsureRuleElementsResult = {
  createdIds: string[];
  existingIds: string[];
};

export const EXAMPLE_RULE_ELEMENTS: RuleElementJson[] = [
  {
    id: 'decision-example-room-area',
    node_type: 'decision',
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
  },
  {
    id: 'start-example',
    node_type: 'start',
    target_class: null,
    property_path: null,
    operator: null,
    value: null,
    true_path: null,
    false_path: null,
    unknown_path: null,
    label: 'Example start node',
    config: {
      library_category: 'Examples',
    },
    graph_uri: null,
  },
  {
    id: 'end-example-pass',
    node_type: 'end',
    target_class: null,
    property_path: null,
    operator: null,
    value: 'The rule passed',
    true_path: null,
    false_path: null,
    unknown_path: null,
    label: 'Example end node — Passed',
    config: {
      library_category: 'Examples',
      end_kind: 'output',
      output_text: 'The rule passed',
    },
    graph_uri: null,
  },
  {
    id: 'end-example-fail',
    node_type: 'end',
    target_class: null,
    property_path: null,
    operator: null,
    value: 'The rule did not pass',
    true_path: null,
    false_path: null,
    unknown_path: null,
    label: 'Example end node — Failed',
    config: {
      library_category: 'Examples',
      end_kind: 'output',
      output_text: 'The rule did not pass',
    },
    graph_uri: null,
  },
  {
    id: 'end-example-missing-data',
    node_type: 'end',
    target_class: null,
    property_path: null,
    operator: null,
    value: 'The rule is missing data and cannot be evaluated',
    true_path: null,
    false_path: null,
    unknown_path: null,
    label: 'Example end node — Missing data',
    config: {
      library_category: 'Examples',
      end_kind: 'output',
      output_text: 'The rule is missing data and cannot be evaluated',
    },
    graph_uri: null,
  },
];

export async function getRulesHealth(): Promise<RuleHealthResponse> {
  const res = await fetch(`${env.apiBaseUrl}/rules/health`);
  if (!res.ok) {
    throw new Error(`Rules health failed: ${res.status}`);
  }
  return res.json();
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
        node_type: 'decision' as const,
      };
    });
  }

  return [];
}

export async function getRuleElementJson(id: string): Promise<{ rule_element: RuleElementJson }> {
  const res = await fetch(`${env.apiBaseUrl}/rules/rule-elements/${id}/json`);
  if (!res.ok) {
    throw new Error(`Get rule element json failed: ${res.status}`);
  }
  return res.json();
}

export async function getRuleElementJsonOrNull(
  id: string
): Promise<{ rule_element: RuleElementJson } | null> {
  const res = await fetch(`${env.apiBaseUrl}/rules/rule-elements/${id}/json`);

  if (res.status === 404) {
    return null;
  }

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Get rule element json failed: ${res.status} ${text}`);
  }

  return res.json();
}

export async function listRuleElementsDetailed(): Promise<DetailedRuleElementListItem[]> {
  const basic = await listRuleElements();
  const detailed: DetailedRuleElementListItem[] = [];

  for (let index = 0; index < basic.length; index += 1) {
    const item = basic[index];
    const id = item.element_id || item.id || `rule-element-${index}`;
    const nodeType: RuleNodeType =
      item.node_type === 'start' || item.node_type === 'end' ? item.node_type : 'decision';

    try {
      const res = await getRuleElementJson(id);
      const rule = res.rule_element;

      detailed.push({
        item_id: `api:${id}`,
        element_id: id,
        graph_uri: item.graph_uri || rule.graph_uri || '',
        node_type: nodeType,
        label: rule.label || rule.id || id,
      });
    } catch {
      detailed.push({
        item_id: `api:${id}`,
        element_id: id,
        graph_uri: item.graph_uri || '',
        node_type: nodeType,
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

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Publish rule element failed: ${res.status} ${text}`);
  }

  return res.json();
}

export async function deleteRuleElement(
  payload: DeleteRuleElementRequest
): Promise<DeleteRuleElementResponse> {
  const res = await fetch(`${env.apiBaseUrl}/rules/rule-elements/delete`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Delete rule element failed: ${res.status} ${text}`);
  }

  return res.json();
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

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Derive rule element failed: ${res.status} ${text}`);
  }

  return res.json();
}

export async function connectRules(
  payload: ConnectRulesRequest
): Promise<ConnectRulesResponse> {
  const res = await fetch(`${env.apiBaseUrl}/rules/connect`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Connect rules failed: ${res.status} ${text}`);
  }

  return res.json();
}

export async function disconnectRules(
  payload: DisconnectRulesRequest
): Promise<DisconnectRulesResponse> {
  const res = await fetch(`${env.apiBaseUrl}/rules/disconnect`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Disconnect rules failed: ${res.status} ${text}`);
  }

  return res.json();
}

export async function checkRulesCompleteness(
  payload: CheckRulesCompletenessRequest
): Promise<CheckRulesCompletenessResponse> {
  const res = await fetch(`${env.apiBaseUrl}/rules/check-completeness`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Check rules completeness failed: ${res.status} ${text}`);
  }

  return res.json();
}

export async function ensureExampleRuleElements(): Promise<EnsureRuleElementsResult> {
  const createdIds: string[] = [];
  const existingIds: string[] = [];

  for (const example of EXAMPLE_RULE_ELEMENTS) {
    const existing = await getRuleElementJsonOrNull(example.id);

    if (existing?.rule_element) {
      existingIds.push(example.id);
      continue;
    }

    await publishRuleElement({
      ...example,
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