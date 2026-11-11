import { useEffect, useRef, useState } from 'react';

import type { DraftEditor } from './draft';
import type { TranslationExtractionResult } from './extraction';
import type {
  TranslationProfile,
  TranslationProfileSummary,
  TranslationRevisionRef,
  TranslationValidationReport,
} from './types';

import {
  archiveTranslationProfile,
  createTranslationProfile,
  extractTranslationMappings,
  getTranslationProfile,
  listTranslationProfiles,
  publishTranslationProfile,
  translationErrorMessage,
  updateTranslationProfile,
  validateTranslationProfile,
} from './api';
import {
  draftFromProfile,
  draftPayload,
  emptyDraft,
  parseDraftMappings,
  readCheckpoint,
  writeCheckpoint,
} from './draft';
import { appendExtractedMappings } from './extraction';
import { failingMappings } from './validation';

function browserStorage() {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function useTranslationDraft(userId: string) {
  const [profile, setProfile] = useState<TranslationProfile | null>(null);
  const [editor, setEditor] = useState(emptyDraft);
  const [profiles, setProfiles] = useState<TranslationProfileSummary[]>([]);
  const [busy, setBusy] = useState(true);
  const [listLoading, setListLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [validationReport, setValidationReport] = useState<TranslationValidationReport | null>(
    null,
  );
  const [extractionResult, setExtractionResult] = useState<TranslationExtractionResult | null>(
    null,
  );
  const [publishedRevision, setPublishedRevision] = useState<TranslationRevisionRef | null>(null);
  const [reloadRequired, setReloadRequired] = useState(false);
  const [publicationUnknown, setPublicationUnknown] = useState(false);
  const lifecycle = useRef(0);
  const listVersion = useRef(0);
  const locked = useRef(true);
  const dirty =
    JSON.stringify(editor) !== JSON.stringify(profile ? draftFromProfile(profile) : emptyDraft());
  const canPublish = Boolean(
    !busy &&
    !reloadRequired &&
    !dirty &&
    profile?.status === 'draft' &&
    validationReport?.profile_id === profile.id &&
    validationReport?.generation === profile.generation &&
    validationReport?.authoring_valid &&
    validationReport?.publish_ready,
  );

  function remember(profileId: string | null) {
    const storage = browserStorage();
    if (storage) writeCheckpoint(storage, userId, profileId);
  }

  function accept(record: TranslationProfile) {
    listVersion.current += 1;
    setProfile(record);
    setEditor(draftFromProfile(record));
    remember(record.status === 'draft' ? record.id : null);
    setProfiles((items) =>
      [record, ...items.filter((item) => item.id !== record.id)].filter(
        (item) => item.status === 'draft',
      ),
    );
  }

  async function extract(record: TranslationProfile, current: number) {
    if (record.status !== 'draft' || !record.contract.destination_modules.length) return;
    try {
      const report = await extractTranslationMappings(record.id, record.generation);
      if (lifecycle.current !== current) return;
      if (report.profile_id !== record.id || report.generation !== record.generation) {
        throw new Error(
          'Extraction report does not match the saved draft. Reload the server draft to retry.',
        );
      }
      if (report.diagnostics.some((diagnostic) => diagnostic.severity === 'error')) {
        setExtractionResult({ report, added: 0, skippedDuplicates: 0 });
        return;
      }
      const savedEditor = draftFromProfile(record);
      const appended = appendExtractedMappings(savedEditor.mappingsText, report.mappings);
      if (appended.added) setEditor({ ...savedEditor, mappingsText: appended.mappingsText });
      setExtractionResult({
        report,
        added: appended.added,
        skippedDuplicates: appended.skippedDuplicates,
      });
    } catch (failure) {
      if (lifecycle.current === current)
        setError(
          `Could not automatically load module mappings. ${translationErrorMessage(failure)}`,
        );
    }
  }

  useEffect(() => {
    const current = ++lifecycle.current;
    const listRequest = ++listVersion.current;
    const storage = browserStorage();
    const profileId = storage ? readCheckpoint(storage, userId) : null;
    void listTranslationProfiles()
      .then(
        (items) => {
          if (lifecycle.current === current && listVersion.current === listRequest)
            setProfiles(items);
        },
        (failure) => {
          if (lifecycle.current === current) setListError(translationErrorMessage(failure));
        },
      )
      .finally(() => {
        if (lifecycle.current === current) setListLoading(false);
      });

    async function restore() {
      try {
        if (profileId) {
          const record = await getTranslationProfile(profileId);
          if (lifecycle.current !== current) return;
          setProfile(record);
          setEditor(draftFromProfile(record));
          setMessage('Reopened the current server draft.');
          await extract(record, current);
        }
      } catch (failure) {
        if (lifecycle.current !== current) return;
        setError(`Could not reopen the previous draft. ${translationErrorMessage(failure)}`);
      } finally {
        if (lifecycle.current === current) {
          locked.current = false;
          setBusy(false);
        }
      }
    }
    void restore();
    return () => {
      lifecycle.current += 1;
    };
  }, [userId]);

  async function run(action: () => Promise<void>) {
    if (locked.current) return;
    locked.current = true;
    const current = lifecycle.current;
    setValidationReport(null);
    setExtractionResult(null);
    setBusy(true);
    setError(null);
    setMessage('');
    try {
      await action();
    } catch (failure) {
      if (lifecycle.current === current) setError(translationErrorMessage(failure));
    } finally {
      if (lifecycle.current === current) {
        locked.current = false;
        setBusy(false);
      }
    }
  }

  function discardChanges() {
    return (
      !dirty ||
      window.confirm('Discard unsaved changes? The saved server draft will not be changed.')
    );
  }

  function open(profileId: string) {
    if (locked.current || !discardChanges()) return;
    const current = lifecycle.current;
    return run(async () => {
      const record = await getTranslationProfile(profileId);
      if (lifecycle.current !== current) return;
      if (record.id !== profileId)
        throw new Error('Reload returned a different translation draft.');
      if (
        profileId === profile?.id &&
        publishedRevision &&
        reloadRequired &&
        record.generation <= publishedRevision.draft_generation
      ) {
        throw new Error(
          'Published revision confirmed, but the server draft generation is stale. Reload before further edits.',
        );
      }
      if (profileId !== profile?.id) setPublishedRevision(null);
      accept(record);
      setReloadRequired(false);
      setPublicationUnknown(false);
      setMessage('Reopened the current server draft.');
      await extract(record, current);
    });
  }

  function startNew() {
    if (locked.current || !discardChanges()) return;
    setValidationReport(null);
    setExtractionResult(null);
    setPublishedRevision(null);
    setReloadRequired(false);
    setPublicationUnknown(false);
    setProfile(null);
    setEditor(emptyDraft());
    setError(null);
    setMessage('');
    remember(null);
  }

  function save() {
    if (reloadRequired || profile?.status === 'archived') return;
    const current = lifecycle.current;
    return run(async () => {
      const payload = draftPayload(editor);
      const record = profile
        ? await updateTranslationProfile(profile.id, {
            ...payload,
            expected_generation: profile.generation,
          })
        : await createTranslationProfile(payload);
      if (lifecycle.current !== current) return;
      accept(record);
      setMessage(
        `Saved draft generation ${record.generation}. Saving does not publish a revision. Upload execution is unavailable.`,
      );
      await extract(record, current);
    });
  }

  function validate() {
    if (!profile || profile.status === 'archived' || dirty || reloadRequired) return;
    const current = lifecycle.current;
    return run(async () => {
      const report = await validateTranslationProfile(profile.id, profile.generation);
      if (lifecycle.current !== current) return;
      if (report.profile_id !== profile.id || report.generation !== profile.generation) {
        throw new Error(
          'Validation report does not match the saved draft. Reload the server draft and validate again.',
        );
      }
      setValidationReport(report);
    });
  }

  function publish() {
    if (!profile || locked.current || (!canPublish && !publicationUnknown)) return;
    const current = lifecycle.current;
    return run(async () => {
      let revision;
      try {
        revision = await publishTranslationProfile(profile.id, profile.generation);
      } catch (failure) {
        if (lifecycle.current !== current) return;
        const response = (
          failure as {
            response?: { status?: number; data?: { detail?: { code?: string } } };
          } | null
        )?.response;
        const status = response?.status;
        const validationUnavailable =
          status === 502 && response?.data?.detail?.code === 'translation_validation_unavailable';
        if (!status || status === 408 || (status >= 500 && !validationUnavailable)) {
          setPublicationUnknown(true);
          setReloadRequired(true);
          throw new Error(
            `Publication outcome is unknown. Retry publication explicitly for the same saved generation (idempotent), or reload the server draft before editing. ${translationErrorMessage(failure)}`,
          );
        }
        throw failure;
      }
      if (lifecycle.current !== current) return;
      setReloadRequired(true);
      if (
        revision.content.profile_id !== profile.id ||
        revision.content.draft_generation !== profile.generation
      ) {
        setPublicationUnknown(true);
        throw new Error(
          'Publication outcome is unknown: the revision does not match the saved draft. Reload the server draft before editing, or retry publication.',
        );
      }
      setPublishedRevision({
        revision_id: revision.revision_id,
        draft_generation: revision.content.draft_generation,
        content_digest: revision.content_digest,
        published_at: revision.published_at,
      });
      setPublicationUnknown(false);
      try {
        const record = await getTranslationProfile(profile.id);
        if (lifecycle.current !== current) return;
        if (record.id !== profile.id || record.generation <= revision.content.draft_generation) {
          throw new Error('The server draft generation has not advanced.');
        }
        accept(record);
        setReloadRequired(false);
        setMessage(
          `Published revision confirmed. Reloaded draft generation ${record.generation}; you can continue editing. Upload execution is unavailable.`,
        );
        await extract(record, current);
      } catch (failure) {
        if (lifecycle.current !== current) return;
        throw new Error(
          `Published revision confirmed, but draft reload failed. Reload before further edits. ${translationErrorMessage(failure)}`,
        );
      }
    });
  }

  function disableFailingMappings() {
    if (
      locked.current ||
      reloadRequired ||
      dirty ||
      !profile ||
      profile.status !== 'draft' ||
      !validationReport ||
      validationReport.profile_id !== profile.id ||
      validationReport.generation !== profile.generation
    )
      return;
    try {
      const parsed = parseDraftMappings(editor.mappingsText);
      const ids = new Set(failingMappings(validationReport, parsed).map((mapping) => mapping.id));
      if (!ids.size) return;
      const original = JSON.parse(
        editor.mappingsText,
      ) as TranslationProfile['contract']['mappings'];
      changeEditor({
        ...editor,
        mappingsText: JSON.stringify(
          original.map((mapping, index) =>
            ids.has(parsed[index].id) ? { ...mapping, enabled: false } : mapping,
          ),
          null,
          2,
        ),
      });
      setMessage('Failing mappings disabled locally. Save draft, then Validate draft again.');
    } catch (failure) {
      setError(translationErrorMessage(failure));
    }
  }

  function archive() {
    if (
      !profile ||
      locked.current ||
      reloadRequired ||
      !window.confirm(
        'Archive this draft? Unsaved changes will be discarded. The saved contract is retained.',
      )
    )
      return;
    const current = lifecycle.current;
    return run(async () => {
      const record = await archiveTranslationProfile(profile.id, profile.generation);
      if (lifecycle.current !== current) return;
      listVersion.current += 1;
      setProfiles((items) => items.filter((item) => item.id !== record.id));
      setProfile(null);
      setPublishedRevision(null);
      setEditor(emptyDraft());
      remember(null);
      setMessage('Draft archived. Its saved contract is retained on the server.');
    });
  }

  async function refreshList() {
    const current = lifecycle.current;
    const listRequest = ++listVersion.current;
    setListLoading(true);
    setListError(null);
    try {
      const items = await listTranslationProfiles();
      if (lifecycle.current === current && listVersion.current === listRequest) setProfiles(items);
    } catch (failure) {
      if (lifecycle.current === current) setListError(translationErrorMessage(failure));
    } finally {
      if (lifecycle.current === current) setListLoading(false);
    }
  }

  function changeEditor(next: DraftEditor) {
    if (locked.current || reloadRequired || profile?.status === 'archived') return;
    setValidationReport(null);
    setExtractionResult(null);
    setPublishedRevision(null);
    setMessage('');
    setEditor(next);
  }

  return {
    profile,
    editor,
    setEditor: changeEditor,
    profiles,
    busy,
    listLoading,
    error,
    listError,
    message,
    validationReport,
    extractionResult,
    publishedRevision,
    reloadRequired,
    publicationUnknown,
    canPublish,
    dirty,
    open,
    startNew,
    save,
    archive,
    validate,
    publish,
    disableFailingMappings,
    refreshList,
  };
}
