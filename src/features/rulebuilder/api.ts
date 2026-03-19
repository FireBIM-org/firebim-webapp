import { env } from '@/config/env';

export type RuleHealthResponse = {
  status?: string;
  ok?: boolean;
};

export type RuleElementListItem = {
  element_id?: string;
  id?: string;
  graph_uri?: string;
  node_type?: 'start' | 'decision' | 'end';
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

export type PublishRuleElementResponse = {
  published?: boolean;
  element_id?: string;
  graph_uri?: string;
  node_type?: string;
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

  if (Array.isArray(data?.graph_uris)) {
    return data.graph_uris.map((graphUri: string) => {
      const parts = graphUri.split('/');
      const id = parts[parts.length - 1] || graphUri;

      return {
        element_id: id,
        graph_uri: graphUri,
        node_type: 'decision',
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

export async function listRuleElementsDetailed(): Promise<
  Array<{
    element_id: string;
    graph_uri: string;
    node_type: 'start' | 'decision' | 'end';
    label: string;
  }>
> {
  const basic = await listRuleElements();

  const detailed = await Promise.all(
    basic.map(async (item, index) => {
      const id = item.element_id || item.id || `rule-element-${index}`;
      const nodeType =
        item.node_type === 'start' || item.node_type === 'end'
          ? item.node_type
          : 'decision';

      try {
        const res = await getRuleElementJson(id);
        const rule = res.rule_element;

        return {
          element_id: id,
          graph_uri: item.graph_uri || rule.graph_uri || '',
          node_type: nodeType,
          label: rule.label || rule.id || id,
        };
      } catch {
        return {
          element_id: id,
          graph_uri: item.graph_uri || '',
          node_type: nodeType,
          label: id,
        };
      }
    })
  );

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

export async function deriveRuleElement(payload: {
  source_id: string;
  new_id: string;
  preserve_paths?: boolean;
  overrides?: Record<string, unknown>;
}) {
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