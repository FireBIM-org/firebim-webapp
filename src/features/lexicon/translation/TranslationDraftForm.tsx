import type { DraftEditor } from './draft';
import type { TranslationProfile } from './types';

import MappingDraftEditor from './MappingDraftEditor';
import ModuleDraftEditor from './ModuleDraftEditor';

export default function TranslationDraftForm({
  editor,
  profile,
  busy,
  dirty,
  reloadRequired,
  canPublish,
  publicationUnknown,
  onChange,
  onSave,
  onArchive,
  onReload,
  onValidate,
  onPublish,
}: {
  editor: DraftEditor;
  profile: TranslationProfile | null;
  busy: boolean;
  dirty: boolean;
  reloadRequired: boolean;
  canPublish: boolean;
  publicationUnknown: boolean;
  onChange: (editor: DraftEditor) => void;
  onSave: () => void;
  onArchive: () => void;
  onReload: () => void;
  onValidate: () => void;
  onPublish: () => void;
}) {
  const archived = profile?.status === 'archived';
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        onSave();
      }}
      className="min-w-0 rounded-lg border border-gray-200 bg-white p-4 sm:p-6"
      aria-busy={busy}
    >
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-gray-950">
            {profile ? 'Translation draft' : 'New translation draft'}
          </h2>
          <p className="mt-1 text-sm text-gray-600">
            {profile ? `Generation ${profile.generation} · ${profile.status}` : 'Not saved yet'}
            {dirty ? ' · Unsaved changes' : ''}
          </p>
          {profile && (
            <p className="mt-1 font-mono text-xs break-all text-gray-500">{profile.id}</p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onValidate}
            disabled={busy || reloadRequired || archived || !profile || dirty}
            aria-describedby="validate-draft-help"
            className="rounded-md border border-orange-300 px-3 py-2 text-sm font-semibold text-orange-800 hover:bg-orange-50 disabled:opacity-50"
          >
            Validate draft
          </button>
          {profile && (
            <button
              type="button"
              onClick={onReload}
              disabled={busy}
              className="rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              Reload server draft
            </button>
          )}
          <button
            type="submit"
            disabled={
              busy ||
              reloadRequired ||
              archived ||
              !editor.name.trim() ||
              (Boolean(profile) && !dirty)
            }
            className="rounded-md bg-orange-600 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? 'Please wait…' : 'Save draft'}
          </button>
        </div>
      </div>
      <p id="validate-draft-help" className="mb-4 text-sm text-gray-600">
        {!profile || dirty
          ? 'Save the draft before validating. Validation checks only the saved generation, not unsaved input.'
          : 'Authoring checks inspect the saved generation and compile supported IFC4 mappings without changing the draft. They do not run uploads or publish mappings.'}
      </p>
      {reloadRequired && (
        <p className="mb-4 rounded-md bg-amber-50 p-3 text-sm text-amber-950">
          {publicationUnknown
            ? 'Publication outcome is unknown. Retry publication for the same generation, or reload the server draft before further edits.'
            : 'Published revision confirmed. Reload before further edits to use the current server draft generation.'}
        </p>
      )}
      {archived && (
        <p role="status" className="mb-4 rounded-md bg-gray-100 p-3 text-sm text-gray-700">
          This draft has been archived and is read-only. Its saved contract is retained.
        </p>
      )}
      <fieldset
        disabled={busy || reloadRequired || archived}
        className="min-w-0 space-y-5 disabled:opacity-70"
      >
        <legend className="sr-only">Translation draft details</legend>
        <div>
          <label
            htmlFor="translation-name"
            className="mb-1 block text-sm font-medium text-gray-700"
          >
            Profile name
          </label>
          <input
            id="translation-name"
            required
            maxLength={200}
            value={editor.name}
            autoFocus
            onChange={(event) => onChange({ ...editor, name: event.target.value })}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-orange-500 focus:ring-orange-500"
            placeholder="e.g. IFC4 architecture pilot"
          />
        </div>
        <div>
          <label
            htmlFor="translation-description"
            className="mb-1 block text-sm font-medium text-gray-700"
          >
            Description (optional)
          </label>
          <textarea
            id="translation-description"
            rows={2}
            value={editor.description}
            onChange={(event) => onChange({ ...editor, description: event.target.value })}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-orange-500 focus:ring-orange-500"
          />
        </div>
        <section aria-labelledby="source-heading" className="border-t border-gray-200 pt-5">
          <h2 id="source-heading" className="text-lg font-semibold text-gray-950">
            Source: IFC4
          </h2>
          <p className="mt-1 text-sm text-gray-600">
            The initial source schema is fixed to IFC4. No rules or rule discovery are required.
          </p>
          <p className="mt-2 text-xs text-gray-500">
            Planned relationships: explicit spatial hierarchy and direct element containment only.
            No inferred room membership.
          </p>
        </section>
        <ModuleDraftEditor
          modules={editor.contract.destination_modules}
          onChange={(modules) =>
            onChange({ ...editor, contract: { ...editor.contract, destination_modules: modules } })
          }
        />
        <MappingDraftEditor
          value={editor.mappingsText}
          disabled={busy || reloadRequired || archived}
          onChange={(mappingsText) => onChange({ ...editor, mappingsText })}
        />
      </fieldset>
      <div className="mt-6 flex flex-wrap items-start justify-between gap-4 border-t border-gray-200 pt-5">
        <div className="max-w-xl">
          <button
            type="button"
            onClick={onPublish}
            disabled={busy || (!canPublish && !publicationUnknown)}
            aria-describedby="publish-revision-help"
            className="rounded-md border border-orange-300 px-3 py-2 text-sm font-semibold text-orange-800 hover:bg-orange-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {publicationUnknown ? 'Retry publication' : 'Publish revision'}
          </button>
          <p id="publish-revision-help" className="mt-2 text-xs text-gray-600">
            Save and validate the current draft before explicitly publishing an immutable revision.
            Authoring checks cover destination release integrity, enabled mappings and bounded IFC4
            mapping compilation, not runtime coverage. Upload execution is unavailable and does not
            block publication. Publishing retains the mutable draft for further editing.
          </p>
        </div>
        {profile && !archived && (
          <button
            type="button"
            onClick={onArchive}
            disabled={busy || reloadRequired}
            className="rounded-md px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
          >
            Archive draft
          </button>
        )}
      </div>
    </form>
  );
}
