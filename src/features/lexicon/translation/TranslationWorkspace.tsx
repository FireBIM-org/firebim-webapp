import Link from 'next/link';

import FailingMappingsDialog from './FailingMappingsDialog';
import TranslationDraftForm from './TranslationDraftForm';
import TranslationExtractionResult from './TranslationExtractionResult';
import TranslationValidationResult from './TranslationValidationResult';
import { useTranslationDraft } from './useTranslationDraft';
import { useUnsavedChanges } from './useUnsavedChanges';

export default function TranslationWorkspace({ userId }: { userId: string }) {
  return <TranslationDraftWorkspace key={userId} userId={userId} />;
}

function TranslationDraftWorkspace({ userId }: { userId: string }) {
  const draft = useTranslationDraft(userId);
  useUnsavedChanges(draft.dirty);
  const latestRevision = draft.profile?.revision_refs
    ?.slice()
    .sort((a, b) => b.draft_generation - a.draft_generation)[0];
  const revision = draft.publishedRevision ?? latestRevision;

  return (
    <div className="space-y-5">
      <header>
        <Link href="/lexicon" className="text-sm font-medium text-orange-700 hover:underline">
          ← Lexicon
        </Link>
        <h1 className="mt-3 text-2xl font-semibold text-gray-950">Start with standards</h1>
        <p className="mt-2 max-w-3xl text-sm text-gray-600">
          Author an IFC4 → destination ontology translation draft, independently of rules. Save
          incomplete work and reopen it from your account.
        </p>
      </header>
      <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
        <strong>Author and publish validated revisions.</strong> Upload execution is unavailable.
        These profiles cannot be selected in the legacy upload filter.
      </div>
      <div className="grid items-start gap-5 lg:grid-cols-[18rem_minmax(0,1fr)]">
        <aside
          aria-labelledby="saved-drafts-heading"
          className="min-w-0 rounded-lg border border-gray-200 bg-white p-4"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id="saved-drafts-heading" className="font-semibold text-gray-950">
              Your translation drafts
            </h2>
            <button
              type="button"
              onClick={() => void draft.refreshList()}
              disabled={draft.listLoading || draft.busy}
              className="rounded px-2 py-1 text-sm text-gray-700 hover:bg-gray-100 disabled:opacity-50"
            >
              Refresh
            </button>
          </div>
          <button
            type="button"
            onClick={draft.startNew}
            disabled={draft.busy}
            className="mt-3 w-full rounded-md border border-orange-300 px-3 py-2 text-sm font-semibold text-orange-800 hover:bg-orange-50 disabled:opacity-50"
          >
            New draft
          </button>
          {draft.listLoading ? (
            <p role="status" className="mt-4 animate-pulse text-sm text-gray-500">
              Loading drafts…
            </p>
          ) : null}
          {draft.listError && (
            <p role="alert" className="mt-4 text-sm text-red-700">
              Could not load drafts. {draft.listError} You can still create a new draft; use Refresh
              to retry the list.
            </p>
          )}
          {!draft.listLoading && !draft.listError && draft.profiles.length === 0 && (
            <p className="mt-4 text-sm text-gray-500">
              No saved translation drafts yet. Give your first draft a name and save it.
            </p>
          )}
          <ul className="mt-4 space-y-2">
            {draft.profiles.map((profile) => (
              <li key={profile.id}>
                <button
                  type="button"
                  onClick={() => void draft.open(profile.id)}
                  disabled={draft.busy}
                  aria-current={draft.profile?.id === profile.id ? 'true' : undefined}
                  className={`w-full rounded-md border px-3 py-3 text-left text-sm disabled:opacity-50 ${draft.profile?.id === profile.id ? 'border-orange-300 bg-orange-50' : 'border-gray-200 hover:bg-gray-50'}`}
                >
                  <span className="block font-medium break-words text-gray-950">
                    {profile.name}
                  </span>
                  <span className="mt-1 block text-xs text-gray-600">
                    Draft · Generation {profile.generation}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </aside>
        <div className="min-w-0 space-y-3">
          {draft.error && (
            <div
              role="alert"
              className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800"
            >
              {draft.error} Your local edits have not been replaced.
            </div>
          )}
          <p role="status" aria-live="polite" className="text-sm text-gray-700">
            {draft.busy
              ? 'Loading, saving, validating, publishing or extracting draft suggestions…'
              : draft.dirty
                ? 'Unsaved changes. Save explicitly before leaving.'
                : draft.message}
          </p>
          <TranslationDraftForm
            key={draft.profile?.id ?? 'new'}
            editor={draft.editor}
            profile={draft.profile}
            busy={draft.busy}
            dirty={draft.dirty}
            reloadRequired={draft.reloadRequired}
            canPublish={draft.canPublish}
            publicationUnknown={draft.publicationUnknown}
            onChange={draft.setEditor}
            onSave={() => void draft.save()}
            onArchive={() => void draft.archive()}
            onValidate={() => void draft.validate()}
            onPublish={() => void draft.publish()}
            onReload={() => {
              if (draft.profile) void draft.open(draft.profile.id);
            }}
          />
          {revision && (
            <section
              aria-labelledby="published-revision-heading"
              className="space-y-2 rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-950"
            >
              <h2 id="published-revision-heading" className="font-semibold">
                {draft.publishedRevision
                  ? 'Published revision confirmed'
                  : 'Latest published revision'}
              </h2>
              <p className="font-mono break-all">{revision.revision_id}</p>
              <p>Draft generation {revision.draft_generation}</p>
              <p className="font-mono break-all">{revision.content_digest}</p>
              <p>Published at {revision.published_at}</p>
              <p>Upload execution is unavailable. This revision does not enable model uploads.</p>
            </section>
          )}
          {draft.validationReport && (
            <>
              <TranslationValidationResult report={draft.validationReport} />
              <FailingMappingsDialog
                report={draft.validationReport}
                mappings={draft.profile?.contract.mappings ?? []}
                onDisable={draft.disableFailingMappings}
              />
            </>
          )}
          {draft.extractionResult && (
            <TranslationExtractionResult result={draft.extractionResult} />
          )}
        </div>
      </div>
    </div>
  );
}
