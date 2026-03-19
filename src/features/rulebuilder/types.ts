export type RuleNodeType = 'start' | 'decision' | 'end';

export type RuleNodeTemplate = {
  type: RuleNodeType;
  label: string;
  description?: string;
  source?: 'local' | 'api';
  element_id?: string;
  template: {
    node_type: RuleNodeType;
    label: string;
    target_class?: string | null;
    property_path?: string | null;
    operator?: string | null;
    value?: unknown;
    true_path?: string | null;
    false_path?: string | null;
    unknown_path?: string | null;
    config?: Record<string, unknown>;
    graph_uri?: string | null;
  };
};

export type RuleLibraryCategory = {
  id: string;
  label: string;
  items: RuleNodeTemplate[];
};