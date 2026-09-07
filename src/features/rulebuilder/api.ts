import axios, { AxiosInstance } from 'axios';

import type { components } from '@/types/api';

import { env } from '@/config/env';

const API_HOST = process.env.NEXT_PUBLIC_API_HOST ?? '';

let isSigningIn = false;

function createProxyAxios(): AxiosInstance {
  const instance = axios.create({
    baseURL: API_HOST,
    headers: {
      'Content-Type': 'application/json',
    },
  });

  if (typeof window !== 'undefined') {
    instance.interceptors.response.use(
      (response) => response,
      async (error) => {
        const isProxy401 =
          error.response?.status === 401 &&
          (error.config?.url as string | undefined)?.startsWith('/api/proxy/');

        if (isProxy401 && !isSigningIn) {
          isSigningIn = true;
          try {
            const { signIn } = await import('next-auth/react');
            await signIn('authentik');
          } catch {
            isSigningIn = false;
          }
        }
        return Promise.reject(error);
      },
    );
  }

  return instance;
}

const proxyAxios = createProxyAxios();

export type RuleHealthResponse = {
  status?: string;
  ok?: boolean;
};

export type RuleElementType = 'start' | 'decision' | 'derive' | 'end';
export type RuleBranch = 'true_path' | 'false_path' | 'unknown_path';
type ApiRuleBranch = 'true' | 'false' | 'unknown';

export type RuleElementListItem = {
  element_id?: string;
  id?: string;
  graph_uri?: string;
  element_type?: RuleElementType;
  label?: string;
};

export type RuleElementJson = {
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
  element_id?: string | null;
};

export type RuleElementPayload = RuleElementJson;

export type RuleBuilderViewport = {
  x: number;
  y: number;
  zoom: number;
};

export type RuleBuilderWorkspaceNode = {
  canvas_node_id: string;
  position: {
    x: number;
    y: number;
  };
  rule: RuleElementJson;
};

export type RuleBuilderWorkspaceEdge = {
  id: string;
  source: string;
  source_handle?: string | null;
  target: string;
  target_handle?: string | null;
};

export type RuleBuilderWorkspacePayload = {
  name: string;
  entry_node_id: string;
  entry_node_label: string;
  viewport: RuleBuilderViewport;
  nodes: RuleBuilderWorkspaceNode[];
  edges: RuleBuilderWorkspaceEdge[];
};

export type RuleBuilderWorkspace = RuleBuilderWorkspacePayload & {
  id: string;
  created_at: string;
  updated_at: string;
};

export type RuleBuilderWorkspaceSummary = {
  id: string;
  name: string;
  entry_node_id: string;
  entry_node_label: string;
  created_at: string;
  updated_at: string;
  node_count: number;
  edge_count: number;
};

export type RuleJson = {
  id: string;
  label?: string | null;
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
  payload: DeleteRuleElementRequest,
): Promise<DeleteRuleElementResponse> {
  const elementId = payload.element_id || payload.graph_uri?.split('/').filter(Boolean).pop();

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

export type ValidateRuleRequest = {
  rule: RuleJson;
};

export type RuleValidateResponse = components['schemas']['RuleValidateResponse'];

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

export type CreateRuleBuilderWorkspaceResponse = {
  workspace: RuleBuilderWorkspace;
};

export type UpdateRuleBuilderWorkspaceResponse = {
  workspace: RuleBuilderWorkspace;
};

export type ListRuleBuilderWorkspacesResponse = {
  count: number;
  workspaces: RuleBuilderWorkspaceSummary[];
};

export type GetRuleBuilderWorkspaceResponse = {
  workspace: RuleBuilderWorkspace;
};

export type DeleteRuleBuilderWorkspaceResponse = {
  deleted: boolean;
  workspace_id: string;
};

export type DeleteRuleBuilderWorkspacesBatchResponse = {
  deleted_ids: string[];
  not_found_ids: string[];
};

export type ExportRuleBuilderWorkspaceRuleElementsResponse = {
  saved: boolean;
  workspace_id: string;
  group_id: string;
  group_name: string;
  entry_node_id: string;
  entry_node_label: string;
  created_count: number;
  elements: Array<{
    source_id: string;
    element_id: string;
    graph_uri: string;
  }>;
  duplicate_rule_element_ids: string[];
};

export type RuleListItem = {
  rule_id: string;
  label: string;
  graph_uri?: string | null;
  source?: 'api' | 'example';
  entry?: string | null;
  rule_element_count?: number | null;
  target_classes?: string[];
  description?: string | null;
};

export type ConvertRuleToWorkspaceResponse = {
  workspace: RuleBuilderWorkspace;
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
      end_kind: 'missing_data',
      output_text: 'The rule is missing data and cannot be evaluated',
    },
    graph_uri: null,
    element_id: null,
  },
  // --- rule elements v2 -----------------------------------------------------------------------------------
  {
    id: 'derive-example-permitted-area',
    element_type: 'derive',
    target_class: 'https://firebim.org/ontologies/fbo/dk#FireCompartment',
    property_path: 'https://firebim.org/ontologies/fbo/dk#MaxAreaFireCompartment',
    operator: null,
    value: null,
    expression: '2000',
    true_path: null,
    false_path: null,
    unknown_path: null,
    label: 'Derive — permitted area = 2 000 m² (constant)',
    config: {
      library_category: 'Examples',
      description:
        'Writes a value on the target and continues. Put one of these on each branch of a flow, then compare the actual area with $ref → MaxAreaFireCompartment in one decision.',
    },
    graph_uri: null,
    element_id: null,
  },
  {
    id: 'derive-example-formula',
    element_type: 'derive',
    target_class: 'https://firebim.org/ontologies/fbo/lt#FireCompartment',
    property_path: 'https://firebim.org/ontologies/fbo/lt#MaxAreaFireCompartment',
    operator: null,
    value: null,
    expression:
      '$https://firebim.org/ontologies/fbo/lt#FsAreaConditionalFireCompartment * $https://firebim.org/ontologies/fbo/lt#GCoeficient * cosd(90 * $https://firebim.org/ontologies/fbo/lt#FireCompartmentHeight / $https://firebim.org/ontologies/fbo/lt#HabsCalculatedAltitude)',
    true_path: null,
    false_path: null,
    unknown_path: null,
    label: 'Derive — formula (Lithuanian Fg = Fs · G · cos(90°·H/Habs))',
    config: {
      library_category: 'Examples',
      description:
        '$<property> reads a value of the target; + - * / ^, min max abs round sqrt, sin cos tan (degrees: sind cosd tand), if(cond, a, b), lookup(). A missing input → Unknown → unknown path.',
    },
    graph_uri: null,
    element_id: null,
  },
  {
    id: 'derive-example-count',
    element_type: 'derive',
    target_class: 'https://firebim.org/ontologies/fbo/dk#BuildingFunctionalFireUnit',
    property_path: 'https://firebim.org/ontologies/fbo/dk#NumberOfExits',
    operator: null,
    value: null,
    expression:
      'sum($https://firebim.org/ontologies/fbo#hasSubitem/https://firebim.org/ontologies/fbo#hasSubitem/https://firebim.org/ontologies/fbo/dk#IsFireExit)',
    true_path: null,
    false_path: null,
    unknown_path: null,
    label: 'Derive — aggregate over a path: number of exit doors = sum(…/IsFireExit)',
    config: {
      library_category: 'Examples',
      description:
        'count / sum / min / max / avg / any / all over every value of a path (a/b/c walks the graph, ^p goes backwards). count of nothing is 0; the others are Unknown when the path has no values.',
    },
    graph_uri: null,
    element_id: null,
  },
  {
    id: 'derive-example-max-code',
    element_type: 'derive',
    target_class: 'https://firebim.org/ontologies/fbo/dk#BuildingFunctionalFireUnit',
    property_path: 'https://firebim.org/ontologies/fbo/dk#RiskClass',
    operator: null,
    value: null,
    expression:
      'max($https://firebim.org/ontologies/fbo#hasSubitem/https://firebim.org/ontologies/fbo/dk#RiskClass)',
    true_path: null,
    false_path: null,
    unknown_path: null,
    label: "Derive — highest code: unit RiskClass = max(compartments' RiskClass)",
    config: {
      library_category: 'Examples',
      description:
        'min/max on codes such as "RK1" < "RK2" < "RK4" or "AK2" < "AK3" compare the codes as text.',
    },
    graph_uri: null,
    element_id: null,
  },
  {
    id: 'decision-example-ref',
    element_type: 'decision',
    target_class: 'https://firebim.org/ontologies/fbo/dk#FireCompartment',
    property_path: 'https://firebim.org/ontologies/fbo/dk#AreaFireCompartment',
    operator: '<=',
    value: { $ref: 'https://firebim.org/ontologies/fbo/dk#MaxAreaFireCompartment' },
    true_path: null,
    false_path: null,
    unknown_path: null,
    label: 'Decision — compare with another property ($ref): area ≤ permitted area',
    config: {
      library_category: 'Examples',
      description:
        'The value is read from another property of the same target — typically one a derive element wrote just before.',
    },
    graph_uri: null,
    element_id: null,
  },
  {
    id: 'decision-example-exists',
    element_type: 'decision',
    target_class: 'https://firebim.org/ontologies/fbo/dk#FireCompartment',
    property_path:
      'https://firebim.org/ontologies/fbo/dk#partOf/https://firebim.org/ontologies/fbo/dk#EmergencyExitLighting',
    operator: 'exists',
    value: null,
    true_path: null,
    false_path: null,
    unknown_path: null,
    label: 'Decision — presence check (exists): emergency exit lighting in the unit?',
    config: {
      library_category: 'Examples',
      description:
        '"exists" is True when the path has a value and False otherwise — never Unknown. The path walks partOf to the bygningsafsnit first.',
    },
    graph_uri: null,
    element_id: null,
  },
  {
    id: 'end-example-rule-link',
    element_type: 'end',
    target_class: null,
    property_path: null,
    operator: null,
    value: '→ dk-compartments-size-ak2-v2',
    true_path: null,
    false_path: null,
    unknown_path: null,
    label: 'End — continue in another rule (link)',
    config: {
      library_category: 'Examples',
      end_kind: 'rule',
      next_rule: 'dk-compartments-size-ak2-v2',
      output_text: '→ dk-compartments-size-ak2-v2',
      description:
        'In the RuleBook the linked rule runs right after this one, only for the targets that ended here — the "What is the maximum area?" dispatcher uses six of these.',
    },
    graph_uri: null,
    element_id: null,
  },
];

function isRuleElementType(value: unknown): value is RuleElementType {
  return value === 'start' || value === 'decision' || value === 'derive' || value === 'end';
}

function normalizeRuleElement(input: unknown): RuleElementJson {
  const raw = (input ?? {}) as Record<string, unknown>;
  const ruleElement =
    raw.rule_element && typeof raw.rule_element === 'object'
      ? (raw.rule_element as Record<string, unknown>)
      : raw.element && typeof raw.element === 'object'
        ? (raw.element as Record<string, unknown>)
        : raw;

  const id = String(ruleElement.id ?? raw.element_id ?? '');
  const elementType = isRuleElementType(ruleElement.element_type)
    ? ruleElement.element_type
    : isRuleElementType(ruleElement.node_type)
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
    expression: (ruleElement.expression as string | null | undefined) ?? null,
    true_path: (ruleElement.true_path as string | null | undefined) ?? null,
    false_path: (ruleElement.false_path as string | null | undefined) ?? null,
    unknown_path: (ruleElement.unknown_path as string | null | undefined) ?? null,
    label: (ruleElement.label as string | null | undefined) ?? null,
    config: (ruleElement.config as Record<string, unknown> | undefined) ?? {},
    graph_uri:
      (raw.graph_uri as string | null | undefined) ??
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
  payload: ConnectRuleRequest,
): Promise<ConnectRuleResponse> {
  const apiBranch: ApiRuleBranch =
    payload.branch === 'true_path' ? 'true' : payload.branch === 'false_path' ? 'false' : 'unknown';

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
  payload: CheckRuleCompletenessRequest,
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

export async function validateRule(payload: ValidateRuleRequest): Promise<RuleValidateResponse> {
  const res = await fetch(`${env.apiBaseUrl}/rules/validate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  return parseJsonResponse<RuleValidateResponse>(res);
}

export async function publishRule(payload: PublishRuleRequest): Promise<PublishRuleResponse> {
  const res = await fetch(`${env.apiBaseUrl}/rules/publish`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  return parseJsonResponse<PublishRuleResponse>(res);
}

export async function createRuleBuilderWorkspace(
  payload: RuleBuilderWorkspacePayload,
): Promise<CreateRuleBuilderWorkspaceResponse> {
  const response = await proxyAxios.post<CreateRuleBuilderWorkspaceResponse>(
    `${env.apiBaseUrl}/rulebuilder/workspaces`,
    payload,
  );
  return response.data;
}

export async function updateRuleBuilderWorkspace(
  workspaceId: string,
  payload: RuleBuilderWorkspacePayload,
): Promise<UpdateRuleBuilderWorkspaceResponse> {
  const response = await proxyAxios.put<UpdateRuleBuilderWorkspaceResponse>(
    `${env.apiBaseUrl}/rulebuilder/workspaces/${workspaceId}`,
    payload,
  );
  return response.data;
}

export async function listRuleBuilderWorkspaces(): Promise<ListRuleBuilderWorkspacesResponse> {
  const response = await proxyAxios.get<ListRuleBuilderWorkspacesResponse>(
    `${env.apiBaseUrl}/rulebuilder/workspaces`,
  );
  return response.data;
}

export async function getRuleBuilderWorkspace(
  workspaceId: string,
): Promise<GetRuleBuilderWorkspaceResponse> {
  const response = await proxyAxios.get<GetRuleBuilderWorkspaceResponse>(
    `${env.apiBaseUrl}/rulebuilder/workspaces/${workspaceId}`,
  );
  return response.data;
}

export async function convertRuleToRuleBuilderWorkspace(
  ruleId: string,
): Promise<ConvertRuleToWorkspaceResponse> {
  const response = await proxyAxios.post<ConvertRuleToWorkspaceResponse>(
    `${env.apiBaseUrl}/rulebuilder/rules/${encodeURIComponent(ruleId)}/workspace`,
    {},
  );
  return response.data;
}

export async function deleteRuleBuilderWorkspace(
  workspaceId: string,
): Promise<DeleteRuleBuilderWorkspaceResponse> {
  const response = await proxyAxios.delete<DeleteRuleBuilderWorkspaceResponse>(
    `${env.apiBaseUrl}/rulebuilder/workspaces/${workspaceId}`,
  );
  return response.data;
}

export async function deleteRuleBuilderWorkspacesBatch(
  workspaceIds: string[],
): Promise<DeleteRuleBuilderWorkspacesBatchResponse> {
  const response = await proxyAxios.post<DeleteRuleBuilderWorkspacesBatchResponse>(
    `${env.apiBaseUrl}/rulebuilder/workspaces/delete-batch`,
    { workspace_ids: workspaceIds },
  );
  return response.data;
}

export async function exportRuleBuilderWorkspaceRuleElements(
  workspaceId: string,
): Promise<ExportRuleBuilderWorkspaceRuleElementsResponse> {
  const response = await proxyAxios.post<ExportRuleBuilderWorkspaceRuleElementsResponse>(
    `${env.apiBaseUrl}/rulebuilder/workspaces/${workspaceId}/export-rule-elements`,
    {},
  );
  return response.data;
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
      graph_uri?.split('/').pop() ??
      `rule-${index}`;

    return {
      rule_id,
      label: (raw.label as string | undefined) ?? (raw.name as string | undefined) ?? rule_id,
      graph_uri,
      source: raw.source === 'example' ? 'example' : 'api',
      entry: (raw.entry as string | undefined) ?? null,
      rule_element_count:
        typeof raw.rule_element_count === 'number'
          ? raw.rule_element_count
          : typeof raw.element_count === 'number'
            ? raw.element_count
            : null,
    };
  });
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

export async function getRuleElement(id: string): Promise<{ rule_element: RuleElementJson }> {
  const res = await fetch(`${env.apiBaseUrl}/rules/rule-elements/${id}`);
  const data = await parseJsonResponse<Record<string, unknown>>(res);

  const rawRuleElement = data?.rule_element ?? data;
  const normalized = normalizeRuleElement(rawRuleElement);

  return {
    rule_element: {
      ...normalized,
      graph_uri: (data.graph_uri as string | null | undefined) ?? normalized.graph_uri ?? null,
    },
  };
}

export async function getRuleElementOrNull(
  id: string,
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
  const detailed = await Promise.all(
    basic.map(
      async (item: RuleElementListItem, index: number): Promise<DetailedRuleElementListItem> => {
        const id = item.element_id || item.id || `rule-element-${index}`;
        const listElementType = isRuleElementType(item.element_type) ? item.element_type : null;
        const hasListMetadata =
          typeof item.label === 'string' && item.label.trim() !== '' && listElementType !== null;

        if (hasListMetadata) {
          return {
            item_id: `api:${id}`,
            element_id: id,
            graph_uri: item.graph_uri || '',
            element_type: listElementType,
            label: item.label!.trim(),
          };
        }

        try {
          const res = await getRuleElement(id);
          const ruleElement = res.rule_element;

          return {
            item_id: `api:${id}`,
            element_id: id,
            graph_uri: item.graph_uri || ruleElement.graph_uri || '',
            element_type: ruleElement.element_type,
            label: ruleElement.label || ruleElement.id || id,
          };
        } catch {
          return {
            item_id: `api:${id}`,
            element_id: id,
            graph_uri: item.graph_uri || '',
            element_type: isRuleElementType(item.element_type) ? item.element_type : 'decision',
            label: item.label?.trim() || id,
          };
        }
      },
    ),
  );

  return detailed;
}

export async function publishRuleElement(
  payload: RuleElementJson,
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
