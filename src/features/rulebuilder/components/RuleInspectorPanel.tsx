import { ChangeEvent } from 'react';
import { Bars3Icon } from '@heroicons/react/24/outline';
import type { RuleData } from '@/features/rulebuilder/editorStore';

type RuleElementType = RuleData['element_type'];

type Props = {
  selectedRule: RuleData | null;
  onChange: (patch: Partial<RuleData>) => void;
  onPublish: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onDerive: () => void;
  onBuildTree?: () => void;
  publishState: 'idle' | 'saving' | 'success' | 'error';
  publishMessage: string | null;
  collapsed: boolean;
  onToggleCollapsed: () => void;
};

function inputValue(value: unknown) {
  if (value === null || value === undefined) return '';
  return String(value);
}

function getEffectiveElementType(rule: RuleData | null): RuleElementType | null {
  if (!rule) return null;

  const raw = rule.element_type ?? null;
  if (raw === 'start' || raw === 'decision' || raw === 'end') return raw;

  return null;
}

export default function RuleInspectorPanel({
  selectedRule,
  onChange,
  onPublish,
  onDuplicate,
  onDelete,
  onDerive,
  onBuildTree,
  publishState,
  publishMessage,
  collapsed,
  onToggleCollapsed,
}: Props) {
  const elementType = getEffectiveElementType(selectedRule);
  const isStart = elementType === 'start';
  const isDecision = elementType === 'decision';
  const isEnd = elementType === 'end';

  const handleTextChange = (field: keyof RuleData) => (event: ChangeEvent<HTMLInputElement>) => {
    const value = event.target.value;

    if (field === 'value' && isEnd) {
      onChange({
        value,
        config: {
          ...selectedRule?.config,
          end_kind: 'output',
          output_text: value,
        },
      });
      return;
    }

    onChange({ [field]: value });
  };

  if (collapsed) {
    return (
      <aside className="flex w-10 flex-col items-center border-l border-gray-200 bg-white py-2">
        <button
          type="button"
          onClick={onToggleCollapsed}
          className="rounded-md p-1 text-gray-500 hover:bg-gray-100 hover:text-gray-700"
          title="Expand rule element details"
        >
          <Bars3Icon className="h-5 w-5" />
        </button>
      </aside>
    );
  }

  if (!selectedRule) {
    return (
      <aside className="w-80 border-l border-gray-200 bg-white">
        <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
          <div>
            <h2 className="rule-workspace-header">Rule element details</h2>
            <p className="text-xs text-gray-500">Select a rule element to inspect it</p>
          </div>

          <button
            type="button"
            onClick={onToggleCollapsed}
            className="rounded-md p-1 text-gray-500 hover:bg-gray-100 hover:text-gray-700"
            title="Collapse rule element details"
          >
            <Bars3Icon className="h-5 w-5" />
          </button>
        </div>

        <div className="flex h-full items-center justify-center p-6 text-sm text-gray-400">
          Select a rule element to inspect and edit its properties.
        </div>
      </aside>
    );
  }

  const disabledClass =
    'w-full rounded-md border border-gray-200 bg-gray-100 px-3 py-2 text-sm text-gray-500';

  const activeClass = 'w-full rounded-md border border-gray-300 px-3 py-2 text-sm';

  return (
    <aside className="w-80 border-l border-gray-200 bg-white">
      <div className="flex h-full flex-col">
        <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
          <div>
            <h2 className="rule-workspace-header">Rule element details</h2>
            <p className="text-xs text-gray-500">Edit the selected rule element</p>
          </div>

          <button
            type="button"
            onClick={onToggleCollapsed}
            className="rounded-md p-1 text-gray-500 hover:bg-gray-100 hover:text-gray-700"
            title="Collapse rule element details"
          >
            <Bars3Icon className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-2 border-b border-gray-200 px-4 py-3">
          <button
            type="button"
            onClick={onDuplicate}
            className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-800 hover:bg-gray-50"
          >
            Duplicate selected rule element
          </button>

          {selectedRule.graph_uri && (
            <button
              type="button"
              onClick={onDerive}
              className="w-full rounded-md border border-blue-300 bg-white px-3 py-2 text-sm font-medium text-blue-700 hover:bg-blue-50"
            >
              Derive from stored rule element
            </button>
          )}

          {isStart && onBuildTree ? (
            <button
              type="button"
              onClick={onBuildTree}
              className="w-full rounded-md border border-indigo-300 bg-white px-3 py-2 text-sm font-medium text-indigo-700 hover:bg-indigo-50"
            >
              Build rule from start rule element
            </button>
          ) : null}

          <button
            type="button"
            onClick={onDelete}
            className="w-full rounded-md border border-red-300 bg-white px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50"
          >
            Delete selected rule element
          </button>

          <button
            type="button"
            onClick={onPublish}
            disabled={publishState === 'saving'}
            className="w-full rounded-md bg-orange-600 px-3 py-2 text-sm font-medium text-white hover:bg-orange-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {publishState === 'saving' ? 'Publishing...' : 'Publish selected rule element'}
          </button>

          {publishMessage && (
            <p
              className={`text-xs ${
                publishState === 'error'
                  ? 'text-red-600'
                  : publishState === 'success'
                    ? 'text-green-600'
                    : 'text-gray-500'
              }`}
            >
              {publishMessage}
            </p>
          )}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-500">
                ID
              </label>
              <input value={inputValue(selectedRule.id)} disabled className={disabledClass} />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-500">
                Rule element type
              </label>
              <input value={inputValue(elementType)} disabled className={disabledClass} />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-500">
                Label
              </label>
              <input
                value={inputValue(selectedRule.label)}
                onChange={handleTextChange('label')}
                className={activeClass}
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-500">
                Target class
              </label>
              <input
                value={inputValue(selectedRule.target_class)}
                onChange={handleTextChange('target_class')}
                disabled={!isDecision}
                className={isDecision ? activeClass : disabledClass}
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-500">
                Property path
              </label>
              <input
                value={inputValue(selectedRule.property_path)}
                onChange={handleTextChange('property_path')}
                disabled={!isDecision}
                className={isDecision ? activeClass : disabledClass}
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-500">
                Operator
              </label>
              <input
                value={inputValue(selectedRule.operator)}
                onChange={handleTextChange('operator')}
                disabled={!isDecision}
                className={isDecision ? activeClass : disabledClass}
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-500">
                {isEnd ? 'Output (value)' : 'Value'}
              </label>

              {isEnd && (
                <p className="mb-1 text-[11px] text-gray-400">
                  This value is used as the rule output
                </p>
              )}

              <input
                value={inputValue(selectedRule.value)}
                onChange={handleTextChange('value')}
                disabled={isStart}
                className={!isStart ? activeClass : disabledClass}
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-500">
                Element ID
              </label>
              <input
                value={inputValue(selectedRule.element_id)}
                disabled
                className={disabledClass}
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-500">
                Graph URI
              </label>
              <input
                value={inputValue(selectedRule.graph_uri)}
                disabled
                className={disabledClass}
              />
            </div>

            <div className="pt-2">
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-500">
                JSON preview
              </label>
              <pre className="max-h-72 overflow-auto rounded-md border border-gray-200 bg-gray-50 p-3 text-xs text-gray-700">
                {JSON.stringify(selectedRule, null, 2)}
              </pre>
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
}
