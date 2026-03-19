import { RuleLibraryCategory } from './types';

export const RULE_LIBRARY: RuleLibraryCategory[] = [
  {
    id: 'under-development',
    label: 'Under development',
    items: [
      {
        type: 'start',
        label: 'Start node',
        description: 'Entry point for a rule flow',
        source: 'local',
        template: {
          node_type: 'start',
          label: 'Start',
          config: {},
        },
      },
      {
        type: 'decision',
        label: 'Decision node',
        description: 'Branch by true / false / unknown',
        source: 'local',
        template: {
          node_type: 'decision',
          label: 'Decision',
          target_class: null,
          property_path: null,
          operator: null,
          value: null,
          true_path: null,
          false_path: null,
          unknown_path: null,
          config: {},
        },
      },
      {
        type: 'end',
        label: 'End node',
        description: 'Terminal output node',
        source: 'local',
        template: {
          node_type: 'end',
          label: 'End',
          config: {},
        },
      },
    ],
  },
];