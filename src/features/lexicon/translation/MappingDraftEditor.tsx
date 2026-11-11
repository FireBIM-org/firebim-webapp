import { useState } from 'react';

import type { TranslationDraftMapping } from './types';

import { parseDraftMappings } from './draft';
import ModuleMappingSummaries from './ModuleMappingSummaries';

export default function MappingDraftEditor({
  value,
  disabled,
  onChange,
}: {
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  const [error, setError] = useState('');
  let moduleMappings: TranslationDraftMapping[];
  try {
    moduleMappings = parseDraftMappings(value).filter(
      (mapping) => mapping.definition.language === 'fbo-module-suggestion/1',
    );
  } catch {
    moduleMappings = [];
  }
  const disabledModules = moduleMappings.filter((mapping) => !mapping.enabled).length;
  const pendingModules = moduleMappings.some(
    (mapping) => !mapping.enabled || mapping.review_state !== 'accepted',
  );

  function review(id: string | null, enabled: boolean) {
    if (disabled) return;
    try {
      const parsed = parseDraftMappings(value);
      const original = JSON.parse(value) as TranslationDraftMapping[];
      onChange(
        JSON.stringify(
          original.map((mapping, index) =>
            (
              id === null
                ? parsed[index].definition.language === 'fbo-module-suggestion/1'
                : parsed[index].id === id
            )
              ? { ...mapping, enabled, ...(enabled ? { review_state: 'accepted' } : {}) }
              : mapping,
          ),
          null,
          2,
        ),
      );
      setError('');
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Could not review the mapping.');
    }
  }

  function add() {
    try {
      const mappings = parseDraftMappings(value);
      let index = mappings.length + 1;
      while (mappings.some((mapping) => mapping.id === `mapping-${index}`)) index += 1;
      onChange(
        JSON.stringify(
          [
            ...mappings,
            { id: `mapping-${index}`, enabled: false, review_state: 'unresolved', definition: {} },
          ],
          null,
          2,
        ),
      );
      setError('');
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Could not add a mapping.');
    }
  }

  return (
    <section aria-labelledby="mappings-heading" className="space-y-3 border-t border-gray-200 pt-5">
      <h2 id="mappings-heading" className="text-lg font-semibold text-gray-950">
        Mapping drafts
      </h2>
      <p id="mappings-help" className="text-sm text-gray-600">
        Saved-draft authoring checks compile supported IFC4 selectors and typed assertions in strict
        ifc4-mapping/1 definitions. Module imports remain raw fbo-module-suggestion/1 suggestions;
        enabled entries are resolved from verified module provenance for compilation. Unsupported
        selectors, wildcards and fire-resistance conversions fail validation. Values such as REI60
        are never inferred or converted here.
      </p>
      <p className="text-sm text-gray-600">
        Mappings load automatically when you open or save a draft with selected modules. Save module
        changes first. New module mappings are enabled by default; existing mappings and disabled
        choices are never overwritten. Save draft explicitly to retain new mappings, then Validate
        draft. If loading fails, resolve the reported issue and reload the server draft to retry.
      </p>
      {moduleMappings.length > 0 && (
        <div className="space-y-2 rounded-md border border-gray-200 p-3">
          {disabledModules > 0 && (
            <p className="text-sm text-amber-950">
              {disabledModules} module {disabledModules === 1 ? 'mapping is' : 'mappings are'}{' '}
              disabled. New defaults apply only to newly loaded mappings; older imports keep their
              saved state.
            </p>
          )}
          <button
            type="button"
            onClick={() => review(null, true)}
            disabled={disabled || !pendingModules}
            aria-describedby="enable-module-mappings-help"
            className="rounded-md border border-orange-300 px-3 py-2 text-sm font-semibold text-orange-800 hover:bg-orange-50 disabled:opacity-50"
          >
            Enable all module mappings
          </button>
          <p id="enable-module-mappings-help" className="text-sm text-gray-600">
            Enables and accepts every module mapping, including previously disabled or rejected
            entries. Manual mappings are unchanged. Save draft, then Validate draft; unsupported
            mappings still fail validation.
          </p>
        </div>
      )}
      <ModuleMappingSummaries value={value} disabled={disabled} onReview={review} />
      <button
        type="button"
        onClick={add}
        className="rounded-md border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
      >
        Add unresolved mapping
      </button>
      <div>
        <label
          htmlFor="mapping-definitions"
          className="mb-1 block text-sm font-medium text-gray-700"
        >
          Mapping definitions (JSON array)
        </label>
        <textarea
          id="mapping-definitions"
          aria-describedby="mappings-help"
          value={value}
          onChange={(event) => {
            onChange(event.target.value);
            setError('');
          }}
          rows={12}
          spellCheck={false}
          className="w-full rounded-md border border-gray-300 px-3 py-2 font-mono text-sm focus:border-orange-500 focus:ring-orange-500"
        />
        <p className="mt-1 text-xs text-gray-500">
          Each entry has a unique id, enabled flag, review_state, optional seed_provenance and a
          definition object. Empty definitions are allowed in drafts.
        </p>
      </div>
      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
    </section>
  );
}
