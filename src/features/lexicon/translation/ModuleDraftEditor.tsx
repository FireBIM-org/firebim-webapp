import { useEffect, useState } from 'react';

import {
  getOntologyLibrary,
  refreshOntologyLibrary,
  type OntologyLibraryEntry,
} from '@/features/ontologies/library';

import type { TranslationOntologyPin } from './types';

const inputClass =
  'w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-orange-500 focus:ring-orange-500';

function libraryIdentities(entries: OntologyLibraryEntry[]) {
  return [...new Set(entries.map((entry) => `${entry.ontology_family}/${entry.country}`))];
}

export default function ModuleDraftEditor({
  modules,
  onChange,
}: {
  modules: TranslationOntologyPin[];
  onChange: (modules: TranslationOntologyPin[]) => void;
}) {
  const [family, setFamily] = useState('');
  const [country, setCountry] = useState('');
  const [suggestions, setSuggestions] = useState(() => libraryIdentities(getOntologyLibrary()));
  const [libraryLoading, setLibraryLoading] = useState(true);
  const [libraryError, setLibraryError] = useState(false);
  const [libraryAttempt, setLibraryAttempt] = useState(0);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    void refreshOntologyLibrary()
      .then((entries) => {
        if (active) setSuggestions(libraryIdentities(entries));
      })
      .catch(() => {
        if (active) setLibraryError(true);
      })
      .finally(() => {
        if (active) setLibraryLoading(false);
      });
    return () => {
      active = false;
    };
  }, [libraryAttempt]);

  function add() {
    const next = {
      family: family.trim(),
      country: country.trim(),
      version: '2026.09.04',
      dependencies: [],
    };
    if (!next.family || !next.country) {
      setError('Choose a library identity before adding a module.');
      return;
    }
    if (
      modules.some(
        (module) =>
          module.family === next.family &&
          module.country === next.country &&
          module.version === next.version,
      )
    ) {
      setError('This module is already in the draft.');
      return;
    }
    onChange([...modules, next]);
    setFamily('');
    setCountry('');
    setError('');
  }

  return (
    <section
      aria-labelledby="destination-heading"
      className="space-y-4 border-t border-gray-200 pt-5"
    >
      <div>
        <h2 id="destination-heading" className="text-lg font-semibold text-gray-950">
          Destination modules
        </h2>
        <p id="destination-help" className="mt-1 text-sm text-gray-600">
          Requested release: 2026.09.04. Save, then use Validate draft to check module availability,
          release integrity and dependency closure. Draft validation does not retain ontology
          artifacts. You can save without selecting any modules.
        </p>
      </div>
      {modules.length === 0 ? (
        <p className="text-sm text-gray-500">No destination modules selected.</p>
      ) : (
        <ul className="divide-y divide-gray-200 rounded-md border border-gray-200">
          {modules.map((module, index) => (
            <li
              key={`${module.family}/${module.country}/${index}`}
              className="flex flex-wrap items-center justify-between gap-2 px-3 py-3 text-sm"
            >
              <div className="min-w-0 break-words">
                <span className="font-medium text-gray-900">
                  {module.family}/{module.country}
                </span>
                <span className="ml-2 text-gray-600">{module.version} · Unverified</span>
                <p className="mt-1 text-xs text-gray-500">
                  {module.dependencies?.length ?? 0} recorded dependencies; pin metadata is retained
                  on save.
                </p>
              </div>
              <button
                type="button"
                onClick={() => onChange(modules.filter((_, itemIndex) => itemIndex !== index))}
                className="rounded-md px-2 py-1 text-gray-700 hover:bg-gray-100 focus-visible:outline-2 focus-visible:outline-orange-600"
                aria-label={`Remove ${module.family}/${module.country}`}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="grid items-end gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
        <div className="min-w-0">
          <label htmlFor="module-library" className="mb-1 block text-sm font-medium text-gray-700">
            Use a library identity
          </label>
          <select
            id="module-library"
            value={family && country ? `${family}/${country}` : ''}
            aria-describedby="module-library-help"
            aria-busy={libraryLoading}
            className={inputClass}
            onChange={(event) => {
              const [nextFamily, ...rest] = event.target.value.split('/');
              setFamily(nextFamily);
              setCountry(rest.join('/'));
              setError('');
            }}
          >
            <option value="">Choose a library identity</option>
            {suggestions.map((identity) => (
              <option key={identity} value={identity}>
                {identity}
              </option>
            ))}
          </select>
        </div>
        <button
          type="button"
          onClick={add}
          className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          Add module
        </button>
      </div>
      <p id="module-library-help" className="text-xs text-gray-500">
        Identity suggestions only, not confirmed releases.
      </p>
      {libraryLoading && (
        <p role="status" className="text-sm text-gray-500">
          Loading ontology library…
        </p>
      )}
      {libraryError && (
        <div role="alert" className="text-sm text-red-700">
          <p>
            Could not load all available ontologies. Cached library identities are still available.
          </p>
          <button
            type="button"
            onClick={() => {
              setLibraryLoading(true);
              setLibraryError(false);
              setLibraryAttempt((attempt) => attempt + 1);
            }}
            className="mt-1 rounded font-medium underline focus-visible:outline-2 focus-visible:outline-orange-600"
          >
            Retry ontology library
          </button>
        </div>
      )}
      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
    </section>
  );
}
