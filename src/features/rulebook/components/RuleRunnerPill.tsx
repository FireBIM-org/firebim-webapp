import React from 'react';

type RuleRunnerPillProps = {
  label: string;
  target_class?: string | null;
};

export function RuleRunnerPill({ label, target_class }: RuleRunnerPillProps) {
  return (
    <div className="inline-flex items-center gap-2 rounded-full border border-slate-300 bg-slate-50 px-3 py-2 text-sm">
      <span className="font-medium text-slate-800">{label}</span>
      {target_class ? (
        <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs text-slate-700">{target_class}</span>
      ) : null}
    </div>
  );
}
