import type { RuleDefinition, RuleListItem } from './types';

export type SeededExampleRule = {
  rule_id: string;
  label: string;
  graph_uri: string;
  description: string;
  rule_definition: RuleDefinition;
  shacl_ttl: string;
};

const FBO = 'http://example.org/fbo/1.0/';

function createEndNode(node_id: string, label: string, terminal_value: string) {
  return {
    id: node_id,
    element_type: 'end' as const,
    target_class: null,
    property_path: null,
    operator: null,
    value: null,
    true_path: null,
    false_path: null,
    unknown_path: null,
    label,
    config: {
      terminal_value,
    },
    graph_uri: null,
  };
}

function createSeededRuleTtl(rule_id: string, target_class: string, property_path: string) {
  return `PREFIX fbo: <${FBO}>\nPREFIX ex: <http://example.org/firebim/>\nPREFIX sh: <http://www.w3.org/ns/shacl#>\n\n# Seeded example for ${rule_id}\n# target_class: <${target_class}>\n# property_path: <${property_path}>\n`;
}

export const SEEDED_EXAMPLE_RULES: SeededExampleRule[] = [
  {
    rule_id: 'example-good-auto-small',
    label: 'Example Good Auto Small',
    graph_uri: 'https://firebim.org/graphs/rulebook/example-good-auto-small',
    description:
      'API-shaped example rule matching the accepted integration-test rule pattern for the small graph.',
    shacl_ttl: createSeededRuleTtl(
      'example-good-auto-small',
      `${FBO}SensorTypeSmokeSensor`,
      `${FBO}HasBuiltInAlarm`
    ),
    rule_definition: {
      id: 'example-good-auto-small',
      entry: 'example-good-auto-small-decision',
      rule_elements: [
        {
          id: 'example-good-auto-small-decision',
          element_type: 'decision',
          target_class: `${FBO}SensorTypeSmokeSensor`,
          property_path: `${FBO}HasBuiltInAlarm`,
          operator: '==',
          value: false,
          true_path: 'example-good-auto-small-pass',
          false_path: 'example-good-auto-small-fail',
          unknown_path: 'example-good-auto-small-unknown',
          label: 'Smoke sensor built-in alarm equals false',
          config: {},
          graph_uri: null,
        },
        createEndNode('example-good-auto-small-pass', 'passed', 'passed'),
        createEndNode('example-good-auto-small-fail', 'failed', 'failed'),
        createEndNode('example-good-auto-small-unknown', 'unknown', 'unknown'),
      ],
    },
  },
  {
    rule_id: 'example-unknown-auto-small',
    label: 'Example Unknown Auto Small',
    graph_uri: 'https://firebim.org/graphs/rulebook/example-unknown-auto-small',
    description:
      'API-shaped example rule that intentionally targets a missing property to exercise the unknown branch.',
    shacl_ttl: createSeededRuleTtl(
      'example-unknown-auto-small',
      `${FBO}SensorTypeSmokeSensor`,
      `${FBO}DoesNotExistYet`
    ),
    rule_definition: {
      id: 'example-unknown-auto-small',
      entry: 'example-unknown-auto-small-decision',
      rule_elements: [
        {
          id: 'example-unknown-auto-small-decision',
          element_type: 'decision',
          target_class: `${FBO}SensorTypeSmokeSensor`,
          property_path: `${FBO}DoesNotExistYet`,
          operator: '==',
          value: true,
          true_path: 'example-unknown-auto-small-pass',
          false_path: 'example-unknown-auto-small-fail',
          unknown_path: 'example-unknown-auto-small-unknown',
          label: 'Unknown property test',
          config: {},
          graph_uri: null,
        },
        createEndNode('example-unknown-auto-small-pass', 'passed', 'passed'),
        createEndNode('example-unknown-auto-small-fail', 'failed', 'failed'),
        createEndNode('example-unknown-auto-small-unknown', 'unknown', 'unknown'),
      ],
    },
  },
];

export const SEEDED_EXAMPLE_RULE_IDS = SEEDED_EXAMPLE_RULES.map(
  (item) => item.rule_id
);

export function getSeededExampleRuleListItems(): RuleListItem[] {
  return SEEDED_EXAMPLE_RULES.map((item) => ({
    rule_id: item.rule_id,
    label: item.label,
    graph_uri: item.graph_uri,
    source: 'example',
    entry: item.rule_definition.entry,
    rule_element_count: item.rule_definition.rule_elements.length,
    target_classes: Array.from(
      new Set(
        item.rule_definition.rule_elements
          .map((element) => element.target_class)
          .filter((value): value is string => Boolean(value))
      )
    ),
    description: item.description,
  }));
}

export function getSeededExampleRuleDefinition(
  rule_id: string
): RuleDefinition | null {
  const match = SEEDED_EXAMPLE_RULES.find((item) => item.rule_id === rule_id);
  return match?.rule_definition ?? null;
}

export function getSeededExampleRuleTtl(rule_id: string): string | null {
  const match = SEEDED_EXAMPLE_RULES.find((item) => item.rule_id === rule_id);
  return match?.shacl_ttl ?? null;
}

export function ensureSeededExampleRules(
  api_rules: RuleListItem[]
): RuleListItem[] {
  const seeded = getSeededExampleRuleListItems();
  const merged = new Map<string, RuleListItem>();

  for (const rule of seeded) {
    merged.set(rule.rule_id, rule);
  }

  for (const rule of api_rules) {
    merged.set(rule.rule_id, rule);
  }

  return Array.from(merged.values()).sort((a, b) => a.label.localeCompare(b.label));
}
