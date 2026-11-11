import { parseDraftMappings } from './draft';
import { isRecord } from './extraction';

function text(value: unknown) {
  return typeof value === 'string' ? value : 'Not specified';
}

export default function ModuleMappingSummaries({
  value,
  disabled = false,
  onReview,
}: {
  value: string;
  disabled?: boolean;
  onReview: (id: string, enabled: boolean) => void;
}) {
  let mappings;
  try {
    mappings = parseDraftMappings(value);
  } catch {
    return null;
  }
  const suggestions = mappings.filter(
    (mapping) => mapping.definition.language === 'fbo-module-suggestion/1',
  );
  if (!suggestions.length) return null;
  return (
    <details className="rounded-md border border-gray-200 p-3">
      <summary className="cursor-pointer font-semibold text-gray-950 focus-visible:outline-orange-600">
        <h3 id="module-mapping-summaries-heading" className="inline">
          Module mapping summaries
        </h3>
        <span className="ml-2 text-sm font-normal text-gray-600">({suggestions.length})</span>
      </summary>
      <section aria-labelledby="module-mapping-summaries-heading" className="mt-3 space-y-3">
        <p className="text-sm text-gray-600">
          New module mappings are enabled by default. Review choices are not proof that a mapping is
          valid. Save draft then Validate draft to check the saved generation; disable or resolve
          unsupported mappings. Existing choices, including disabled mappings, are preserved on
          reload. Import-time review flags are retained evidence, not the latest validation result.
        </p>
        <ul className="space-y-3 text-sm text-gray-700">
          {suggestions.map((mapping) => {
            const target = isRecord(mapping.definition.target) ? mapping.definition.target : {};
            const provenance = isRecord(mapping.seed_provenance) ? mapping.seed_provenance : {};
            const issues = Array.isArray(mapping.definition.review_issues)
              ? mapping.definition.review_issues.filter((issue) => typeof issue === 'string')
              : [];
            const kind = ['class', 'datatype_property', 'object_property'].includes(
              text(target.kind),
            )
              ? text(target.kind)
              : 'Unknown (unresolved)';
            return (
              <li
                key={mapping.id}
                className="space-y-1 rounded-md border border-gray-200 p-3 break-words"
              >
                <p className="font-medium">{mapping.id}</p>
                <p>Target IRI: {text(target.iri)}</p>
                <p>Target kind: {kind}</p>
                <p>
                  Review state: {mapping.review_state} · {mapping.enabled ? 'Enabled' : 'Disabled'}
                </p>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => onReview(mapping.id, true)}
                    disabled={disabled || (mapping.enabled && mapping.review_state === 'accepted')}
                    className="rounded-md border border-orange-300 px-3 py-2 text-sm font-semibold text-orange-800 hover:bg-orange-50 disabled:opacity-50"
                  >
                    Accept and enable
                  </button>
                  <button
                    type="button"
                    onClick={() => onReview(mapping.id, false)}
                    disabled={disabled || !mapping.enabled}
                    className="rounded-md border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                  >
                    Disable mapping
                  </button>
                </div>
                {provenance.kind === 'ontology_module' && (
                  <>
                    <p>
                      Module:{' '}
                      {isRecord(provenance.module)
                        ? `${text(provenance.module.family)} / ${text(provenance.module.country)} / ${text(provenance.module.version)}`
                        : 'Not specified'}
                    </p>
                    <p>
                      SHA256:{' '}
                      {isRecord(provenance.module)
                        ? text(provenance.module.sha256)
                        : 'Not specified'}
                    </p>
                    <p>Declaration IRI: {text(provenance.declaration_iri)}</p>
                    <p>Provenance target IRI: {text(provenance.target_iri)}</p>
                  </>
                )}
                {issues.length > 0 && (
                  <ul
                    aria-label={`Review issues for ${mapping.id}`}
                    className="list-inside list-disc"
                  >
                    {issues.map((issue, index) => (
                      <li key={index}>{issue}</li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      </section>
    </details>
  );
}
