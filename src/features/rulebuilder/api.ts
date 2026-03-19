import { env } from '@/config/env';

export type RuleHealthResponse = {
  status?: string;
  ok?: boolean;
};

export type RuleElementListItem = {
  element_id?: string;
  id?: string;
  graph_uri?: string;
  node_type?: string;
};

export type RuleElementJson = {
  id: string;
  node_type: 'start' | 'decision' | 'end';
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
    throw new Error(`List rule elements failed: ${res.status}`);
  }

  const data = await res.json();

  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.items)) return data.items;
  if (Array.isArray(data?.rule_elements)) return data.rule_elements;

  return [];
}

export async function getRuleElementJson(id: string): Promise<{ rule_element: RuleElementJson }> {
  const res = await fetch(`${env.apiBaseUrl}/rules/rule-elements/${id}/json`);
  if (!res.ok) {
    throw new Error(`Get rule element json failed: ${res.status}`);
  }
  return res.json();
}