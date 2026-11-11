import { Description, Dialog, DialogBackdrop, DialogPanel, DialogTitle } from '@headlessui/react';
import { useState } from 'react';

import type { TranslationDraftMapping, TranslationValidationReport } from './types';

import { failingMappings } from './validation';

export default function FailingMappingsDialog({
  report,
  mappings,
  onDisable,
}: {
  report: TranslationValidationReport;
  mappings: TranslationDraftMapping[];
  onDisable: () => void;
}) {
  const [open, setOpen] = useState(true);
  const failures = failingMappings(report, mappings);
  if (!failures.length) return null;

  return (
    <Dialog open={open} onClose={() => setOpen(false)} className="relative z-50">
      <DialogBackdrop className="fixed inset-0 bg-gray-500/75" />
      <div className="fixed inset-0 overflow-y-auto p-4">
        <div className="flex min-h-full items-center justify-center">
          <DialogPanel className="w-full max-w-xl min-w-0 space-y-4 rounded-lg bg-white p-4 shadow-xl sm:p-6">
            <DialogTitle className="text-lg font-semibold text-gray-950">
              Disable failing mappings?
            </DialogTitle>
            <Description className="text-sm text-gray-700">
              {failures.length} enabled {failures.length === 1 ? 'mapping has' : 'mappings have'}{' '}
              validation errors in generation {report.generation}. Disable these mappings in your
              local draft? Other mappings, definitions and review decisions will stay unchanged.
            </Description>
            <ul
              aria-label="Failing mappings"
              className="max-h-64 space-y-3 overflow-y-auto rounded-md border border-gray-200 p-3"
            >
              {failures.map((mapping) => (
                <li key={mapping.id} className="space-y-1 text-sm text-gray-700">
                  <p className="font-mono text-xs font-semibold break-all text-gray-950">
                    {mapping.id}
                  </p>
                  {report.diagnostics
                    .filter(
                      (diagnostic) =>
                        diagnostic.severity === 'error' && diagnostic.mapping_id === mapping.id,
                    )
                    .map((diagnostic, index) => (
                      <p key={index} className="break-words">
                        {diagnostic.message}
                      </p>
                    ))}
                </li>
              ))}
            </ul>
            <p className="text-sm text-amber-950">
              Disabling reduces translation coverage; it does not fix these mappings or other
              validation errors. Save draft, then Validate draft again before publishing. Upload
              execution remains unavailable.
            </p>
            <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                data-autofocus
                onClick={() => setOpen(false)}
                className="rounded-md border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
              >
                Keep mappings enabled
              </button>
              <button
                type="button"
                onClick={onDisable}
                className="rounded-md bg-orange-600 px-3 py-2 text-sm font-semibold text-white hover:bg-orange-700"
              >
                Disable failing mappings
              </button>
            </div>
          </DialogPanel>
        </div>
      </div>
    </Dialog>
  );
}
