import type { TranslationExtractionResult } from './extraction';

export default function TranslationExtractionResult({
  result,
}: {
  result: TranslationExtractionResult;
}) {
  const { report, added, skippedDuplicates } = result;
  const blocked = report.diagnostics.some((diagnostic) => diagnostic.severity === 'error');
  return (
    <section
      aria-labelledby="module-extraction-heading"
      className="space-y-3 rounded-lg border border-gray-200 bg-white p-4 text-sm text-gray-700"
    >
      <h2 id="module-extraction-heading" className="font-semibold text-gray-950">
        Module extraction
      </h2>
      <p>Saved draft · Generation {report.generation}</p>
      <p>
        {blocked
          ? 'No suggestions loaded. Resolve the module errors before trying again.'
          : `${added} new module mapping${added === 1 ? '' : 's'} added to the editor.`}{' '}
        {report.skipped_existing + skippedDuplicates} existing or duplicate mappings skipped.
      </p>
      <p>
        New module mappings are enabled by default, not validated. Save draft, then Validate draft.
        Unsupported mappings must be disabled or resolved. Publish remains unavailable.
      </p>
      <ul aria-label="Extraction diagnostics" className="space-y-3">
        {report.diagnostics.map((diagnostic, index) => (
          <li key={index} className="border-t border-gray-200 pt-3 break-words">
            <p className="font-medium">
              {diagnostic.mapping_id === null ? 'Draft' : `Mapping ${diagnostic.mapping_id}`}
            </p>
            <code className="text-xs">{diagnostic.field_path}</code>
            <p className="text-xs">
              {diagnostic.severity} · {diagnostic.code}
            </p>
            <p>{diagnostic.message}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
