import type { TranslationValidationReport } from './types';

const stepLabels = {
  destination_ontologies: 'Destination ontologies',
  mappings: 'Mappings',
  publication: 'Publication',
};

export default function TranslationValidationResult({
  report,
}: {
  report: TranslationValidationReport;
}) {
  return (
    <section
      aria-labelledby="draft-validation-heading"
      className="space-y-3 rounded-lg border border-gray-200 bg-white p-4"
    >
      <h2 id="draft-validation-heading" className="font-semibold text-gray-950">
        Draft checks
      </h2>
      <p className="text-sm text-gray-700">Saved draft · Generation {report.generation}</p>
      <p className="text-sm text-gray-700">
        {report.authoring_valid ? 'Authoring checks passed.' : 'Draft checks incomplete or failed.'}
      </p>
      <p className="rounded-md bg-amber-50 p-3 text-sm font-semibold text-amber-950">
        {report.publish_ready
          ? 'Ready to publish an immutable revision.'
          : 'Publication requires valid authoring checks.'}{' '}
        Upload execution is unavailable and does not block publication.
      </p>
      <ol className="space-y-2 text-sm text-gray-700">
        {report.steps.map((step) => (
          <li key={step.id}>
            <strong>
              {stepLabels[step.id]}: {step.status}
            </strong>
            <p>{step.message}</p>
          </li>
        ))}
      </ol>
      <ul aria-label="Validation diagnostics" className="space-y-3 text-sm text-gray-700">
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
