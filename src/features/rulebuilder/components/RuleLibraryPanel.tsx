import { useState } from 'react';
import {
  ChevronDownIcon,
  ChevronRightIcon,
  Bars3Icon,
} from '@heroicons/react/24/outline';
import { RuleLibraryCategory, RuleNodeTemplate } from '../types';

type Props = {
  collapsed: boolean;
  onToggleCollapsed: () => void;
  categories: RuleLibraryCategory[];
};

function draggablePayload(item: RuleNodeTemplate) {
  return JSON.stringify({
    kind: 'rule-node-template',
    nodeType: item.type,
    template: item.template,
    label: item.label,
    source: item.source || 'local',
    element_id: item.element_id,
  });
}

function NodeItem({ item }: { item: RuleNodeTemplate }) {
  const handleDragStart = (event: React.DragEvent) => {
    event.dataTransfer.setData(
      'application/firebim-rule-node',
      draggablePayload(item)
    );
    event.dataTransfer.effectAllowed = 'move';
  };

  return (
    <div
      draggable
      onDragStart={handleDragStart}
      className="cursor-move rounded-md border border-gray-200 bg-white px-3 py-2 text-sm shadow-sm hover:border-gray-300 hover:bg-gray-50"
    >
      <div className="font-medium text-gray-800">{item.label}</div>

      {item.description && (
        <div className="mt-1 text-xs text-gray-500 line-clamp-2">
          {item.description}
        </div>
      )}

      {item.source === 'api' && (
        <div className="mt-1 text-[10px] uppercase text-orange-600">
          stored
        </div>
      )}
    </div>
  );
}

function Category({
  category,
}: {
  category: RuleLibraryCategory;
}) {
  const [open, setOpen] = useState(true);

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="flex w-full items-center justify-between px-2 py-1 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 hover:text-gray-700"
      >
        <span>{category.label}</span>
        {open ? (
          <ChevronDownIcon className="h-4 w-4" />
        ) : (
          <ChevronRightIcon className="h-4 w-4" />
        )}
      </button>

      {open && (
        <div className="mt-2 space-y-2 px-1">
          {category.items.length === 0 ? (
            <div className="rounded-md border border-dashed border-gray-200 px-3 py-4 text-center text-xs text-gray-400">
              No items
            </div>
          ) : (
            category.items.map((item, index) => (
              <NodeItem key={`${category.id}-${index}`} item={item} />
            ))
          )}
        </div>
      )}
    </div>
  );
}

export default function RuleLibraryPanel({
  collapsed,
  onToggleCollapsed,
  categories,
}: Props) {
  if (collapsed) {
    return (
      <aside className="flex w-10 flex-col items-center border-r border-gray-200 bg-white py-2">
        <button
          type="button"
          onClick={onToggleCollapsed}
          className="rounded-md p-1 text-gray-500 hover:bg-gray-100 hover:text-gray-700"
        >
          <Bars3Icon className="h-5 w-5" />
        </button>
      </aside>
    );
  }

  return (
    <aside className="flex w-72 flex-col border-r border-gray-200 bg-white">
      <div className="flex items-center justify-between border-b border-gray-200 px-3 py-2">
        <div>
          <div className="text-sm font-semibold text-gray-900">
            Node Library
          </div>
          <div className="text-xs text-gray-500">
            Drag nodes into the canvas
          </div>
        </div>

        <button
          type="button"
          onClick={onToggleCollapsed}
          className="rounded-md p-1 text-gray-500 hover:bg-gray-100 hover:text-gray-700"
        >
          <Bars3Icon className="h-5 w-5" />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 py-3 space-y-4">
        {categories.map((category) => (
          <Category key={category.id} category={category} />
        ))}
      </div>
    </aside>
  );
}