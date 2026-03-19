import { useEffect, useState } from 'react';
import { ChevronDownIcon, ChevronRightIcon, Bars3Icon } from '@heroicons/react/24/outline';
import { RuleLibraryCategory, RuleNodeTemplate } from '../types';

type Props = {
  collapsed: boolean;
  onToggleCollapsed: () => void;
  categories?: RuleLibraryCategory[];
};

function draggablePayload(item: RuleNodeTemplate) {
  return JSON.stringify({
    kind: 'rule-node-template',
    nodeType: item.type,
    template: item.template,
    label: item.label,
    source: item.source || 'local',
  });
}

export default function RuleLibraryPanel({
  collapsed,
  onToggleCollapsed,
  categories = [],
}: Props) {
  const [openCategories, setOpenCategories] = useState<Record<string, boolean>>({});

  useEffect(() => {
    setOpenCategories((prev) => {
      const next = { ...prev };
      for (const category of categories) {
        if (!(category.id in next)) {
          next[category.id] = category.id === 'under-development';
        }
      }
      return next;
    });
  }, [categories]);

  const toggleCategory = (categoryId: string) => {
    setOpenCategories((prev) => ({
      ...prev,
      [categoryId]: !prev[categoryId],
    }));
  };

  return (
    <aside
      className={`border-r border-gray-200 bg-white transition-all duration-200 ${
        collapsed ? 'w-14' : 'w-80'
      }`}
    >
      <div className="flex h-full flex-col">
        <div className="flex items-center justify-between border-b border-gray-200 px-3 py-3">
          {!collapsed && (
            <div>
              <h2 className="text-sm font-semibold text-gray-900">Node Library</h2>
              <p className="text-xs text-gray-500">Drag nodes into the canvas</p>
            </div>
          )}

          <button
            type="button"
            onClick={onToggleCollapsed}
            className="rounded-md p-2 text-gray-600 hover:bg-gray-100 hover:text-gray-900"
            title={collapsed ? 'Open library' : 'Collapse library'}
          >
            <Bars3Icon className="h-5 w-5" />
          </button>
        </div>

        {!collapsed && (
          <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
            {(categories || []).map((category) => {
              const isOpen = openCategories[category.id] ?? false;

              return (
                <div key={category.id} className="mb-3 rounded-lg border border-gray-200">
                  <button
                    type="button"
                    onClick={() => toggleCategory(category.id)}
                    className="flex w-full items-center justify-between px-3 py-2 text-left hover:bg-gray-50"
                  >
                    <span className="text-sm font-medium text-gray-800">{category.label}</span>
                    {isOpen ? (
                      <ChevronDownIcon className="h-4 w-4 text-gray-500" />
                    ) : (
                      <ChevronRightIcon className="h-4 w-4 text-gray-500" />
                    )}
                  </button>

                  {isOpen && (
                    <div className="border-t border-gray-200 px-2 py-2">
                      <div className="space-y-2">
                        {category.items.length === 0 && (
                          <div className="rounded-lg border border-dashed border-gray-200 px-3 py-3 text-xs text-gray-400">
                            No items
                          </div>
                        )}

                        {category.items.map((item) => (
                          <div
                            key={`${category.id}-${item.type}-${item.label}`}
                            draggable
                            onDragStart={(event) => {
                              event.dataTransfer.setData(
                                'application/firebim-rule-node',
                                draggablePayload(item)
                              );
                              event.dataTransfer.effectAllowed = 'move';
                            }}
                            className="cursor-grab rounded-lg border border-gray-200 bg-gray-50 px-3 py-3 hover:border-orange-300 hover:bg-orange-50 active:cursor-grabbing"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-sm font-semibold text-gray-900">
                                {item.label}
                              </span>
                              <span className="rounded bg-gray-200 px-2 py-0.5 text-[10px] uppercase tracking-wide text-gray-700">
                                {item.type}
                              </span>
                            </div>

                            {item.description && (
                              <p className="mt-1 text-xs text-gray-500">{item.description}</p>
                            )}

                            {item.source && (
                              <p className="mt-2 text-[10px] uppercase tracking-wide text-gray-400">
                                {item.source}
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </aside>
  );
}