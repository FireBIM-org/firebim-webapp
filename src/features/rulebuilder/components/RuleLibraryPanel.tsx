import { useMemo, useState } from 'react';
import {
  ChevronDownIcon,
  ChevronRightIcon,
  Bars3Icon,
  FolderPlusIcon,
  PencilSquareIcon,
  TrashIcon,
} from '@heroicons/react/24/outline';
import { RuleLibraryCategory, RuleNodeTemplate } from '../types';
import { getNodePalette } from './RuleElementNode';

type Props = {
  collapsed: boolean;
  onToggleCollapsed: () => void;
  categories: RuleLibraryCategory[];

  selectedItemIds?: string[];
  onToggleItemSelected?: (itemId: string, multi?: boolean) => void;
  onMoveSelectedToCategory?: (categoryId: string) => void;
  onCreateCategory?: () => void;
  onRenameCategory?: (categoryId: string) => void;
  onMoveSelectedToTrash?: () => void;
  onEmptyTrash?: () => void;
};

function draggablePayload(item: RuleNodeTemplate) {
  return JSON.stringify({
    kind: 'rule-node-template',
    item_id: item.id,
    nodeType: item.type,
    template: {
      ...item.template,
      label: item.template.label || item.label,
    },
    label: item.label,
    source: item.source || 'local',
    element_id: item.element_id,
  });
}

function NodeItem({
  item,
  selected,
  onToggleSelected,
}: {
  item: RuleNodeTemplate;
  selected: boolean;
  onToggleSelected?: (multi?: boolean) => void;
}) {
  const handleDragStart = (event: React.DragEvent) => {
    event.dataTransfer.setData(
      'application/firebim-rule-node',
      draggablePayload(item)
    );
    event.dataTransfer.effectAllowed = 'move';
  };

  const handleClick = (event: React.MouseEvent) => {
    event.stopPropagation();
    onToggleSelected?.(event.metaKey || event.ctrlKey);
  };

  const palette = getNodePalette(item.type);

  return (
    <div
      draggable
      onClick={handleClick}
      onDragStart={handleDragStart}
      className={[
        'cursor-move overflow-hidden rounded-lg border bg-white text-sm shadow-sm transition',
        selected
          ? `${palette.border} ring-2 ${palette.ring}`
          : `${palette.border} hover:shadow-md`,
      ].join(' ')}
    >
      <div className={`border-b px-3 py-2 ${palette.header}`}>
        <div className={`text-[11px] font-semibold uppercase tracking-wide ${palette.badge}`}>
          {item.type === 'start'
            ? 'Start'
            : item.type === 'decision'
            ? 'Decision'
            : 'End'}
        </div>

        <div className="mt-1 font-medium text-gray-900">{item.label}</div>
      </div>

      <div className={`px-3 py-2 ${palette.body}`}>
        {item.description && (
          <div className="text-xs text-gray-500 line-clamp-2">
            {item.description}
          </div>
        )}

        {item.source === 'api' && (
          <div className="mt-2 text-[10px] uppercase text-orange-600">
            stored
          </div>
        )}
      </div>
    </div>
  );
}

function Category({
  category,
  selectedCount,
  selectedItemIds,
  onToggleItemSelected,
  onMoveSelectedToCategory,
  onRenameCategory,
  onEmptyTrash,
}: {
  category: RuleLibraryCategory;
  selectedCount: number;
  selectedItemIds: string[];
  onToggleItemSelected?: (itemId: string, multi?: boolean) => void;
  onMoveSelectedToCategory?: (categoryId: string) => void;
  onRenameCategory?: (categoryId: string) => void;
  onEmptyTrash?: () => void;
}) {
  const [open, setOpen] = useState(true);

  const isTrash = category.id === 'trash';

  return (
    <div>
      <div className="flex items-center justify-between px-2 py-1">
        <button
          type="button"
          onClick={() => setOpen((prev) => !prev)}
          className="flex min-w-0 flex-1 items-center justify-between text-left text-xs font-semibold uppercase tracking-wide text-gray-500 hover:text-gray-700"
        >
          <span className="truncate">{category.label}</span>
          {open ? (
            <ChevronDownIcon className="ml-2 h-4 w-4 shrink-0" />
          ) : (
            <ChevronRightIcon className="ml-2 h-4 w-4 shrink-0" />
          )}
        </button>

        <div className="ml-2 flex items-center gap-1">
          {!category.system && onRenameCategory && (
            <button
              type="button"
              onClick={() => onRenameCategory(category.id)}
              className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
              title="Rename category"
            >
              <PencilSquareIcon className="h-4 w-4" />
            </button>
          )}

          {selectedCount > 0 && onMoveSelectedToCategory && (
            <button
              type="button"
              onClick={() => onMoveSelectedToCategory(category.id)}
              className="rounded px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-blue-600 hover:bg-blue-50"
              title="Move selected here"
            >
              Move here
            </button>
          )}

          {isTrash && onEmptyTrash && (
            <button
              type="button"
              onClick={() => {
                const ok = window.confirm(
                  'Are you sure you want to empty the waste bin?'
                );
                if (ok) onEmptyTrash();
              }}
              className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600"
              title="Empty waste bin"
            >
              <TrashIcon className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {open && (
        <div className="mt-2 space-y-2 px-1">
          {category.items.length === 0 ? (
            <div className="rounded-md border border-dashed border-gray-200 px-3 py-4 text-center text-xs text-gray-400">
              No items
            </div>
          ) : (
            category.items.map((item) => (
              <NodeItem
                key={item.id}
                item={item}
                selected={selectedItemIds.includes(item.id)}
                onToggleSelected={(multi) =>
                  onToggleItemSelected?.(item.id, multi)
                }
              />
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
  selectedItemIds = [],
  onToggleItemSelected,
  onMoveSelectedToCategory,
  onCreateCategory,
  onRenameCategory,
  onMoveSelectedToTrash,
  onEmptyTrash,
}: Props) {
  const selectedCount = useMemo(() => selectedItemIds.length, [selectedItemIds]);

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
            Rule element Library
          </div>
          <div className="text-xs text-gray-500">
            Drag rule elements into the canvas
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

      <div className="flex items-center gap-2 border-b border-gray-200 px-3 py-2">
        <button
          type="button"
          onClick={() => onCreateCategory?.()}
          className="inline-flex items-center gap-1 rounded-md border border-gray-200 px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50"
        >
          <FolderPlusIcon className="h-4 w-4" />
          New category
        </button>

        <button
          type="button"
          onClick={() => onMoveSelectedToTrash?.()}
          disabled={selectedCount === 0 || !onMoveSelectedToTrash}
          className="inline-flex items-center gap-1 rounded-md border border-gray-200 px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <TrashIcon className="h-4 w-4" />
          Waste bin
        </button>
      </div>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-3 py-3">
        {categories.map((category) => (
          <Category
            key={category.id}
            category={category}
            selectedCount={selectedCount}
            selectedItemIds={selectedItemIds}
            onToggleItemSelected={onToggleItemSelected}
            onMoveSelectedToCategory={onMoveSelectedToCategory}
            onRenameCategory={onRenameCategory}
            onEmptyTrash={onEmptyTrash}
          />
        ))}
      </div>
    </aside>
  );
}