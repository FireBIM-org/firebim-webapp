// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { RuleData } from '@/features/rulebuilder/editorStore';

import RuleInspectorPanel from './RuleInspectorPanel';

function renderDecision(value: unknown, id = 'decision-1') {
  const onChange = vi.fn();
  const selectedRule: RuleData = {
    id,
    element_type: 'decision',
    label: 'Decision',
    target_class: 'https://firebim.org/ontologies/fbo#Wall',
    property_path: 'https://firebim.org/ontologies/fbo#Area',
    operator: '>',
    value,
  };

  const view = render(
    <RuleInspectorPanel
      selectedRule={selectedRule}
      onChange={onChange}
      ontologyLibrary={[]}
      selectedOntologyIds={[]}
      onSelectedOntologyIdsChange={vi.fn()}
      validationIssues={[]}
      validationStatus="idle"
      collapsed={false}
      onToggleCollapsed={vi.fn()}
    />,
  );

  return { ...view, onChange };
}

describe('RuleInspectorPanel decision literal values', () => {
  afterEach(() => cleanup());

  it('converts an existing string to a number and emits numeric edits', () => {
    const { onChange } = renderDecision('15');

    const dataType = screen.getByRole('combobox', { name: 'Value data type' });
    expect((dataType as HTMLSelectElement).value).toBe('string');
    fireEvent.change(dataType, { target: { value: 'number' } });
    expect(onChange).toHaveBeenLastCalledWith({ value: 15 });

    fireEvent.change(screen.getByRole('spinbutton', { name: 'Number value' }), {
      target: { value: '-1.25' },
    });
    expect(onChange).toHaveBeenLastCalledWith({ value: -1.25 });
  });

  it('retains explicit string values that look numeric or boolean', () => {
    renderDecision('false');

    expect(
      (screen.getByRole('combobox', { name: 'Value data type' }) as HTMLSelectElement).value,
    ).toBe('string');
    expect((screen.getByRole('textbox', { name: 'String value' }) as HTMLInputElement).value).toBe(
      'false',
    );
  });

  it('converts a false-looking string to false rather than using string truthiness', () => {
    const { onChange } = renderDecision('false');

    fireEvent.change(screen.getByRole('combobox', { name: 'Value data type' }), {
      target: { value: 'boolean' },
    });

    expect(onChange).toHaveBeenLastCalledWith({ value: false });
    expect(
      (screen.getByRole('combobox', { name: 'Boolean value' }) as HTMLSelectElement).value,
    ).toBe('false');
  });

  it('keeps loaded booleans native and permits explicitly editing true and false', () => {
    const { onChange } = renderDecision(true);

    expect(
      (screen.getByRole('combobox', { name: 'Value data type' }) as HTMLSelectElement).value,
    ).toBe('boolean');
    const booleanValue = screen.getByRole('combobox', { name: 'Boolean value' });
    fireEvent.change(booleanValue, { target: { value: 'false' } });
    expect(onChange).toHaveBeenLastCalledWith({ value: false });
    fireEvent.change(booleanValue, { target: { value: 'true' } });
    expect(onChange).toHaveBeenLastCalledWith({ value: true });
  });

  it('clears invalid numeric input without changing the selected type or emitting NaN', () => {
    const { onChange } = renderDecision(15);
    const numberValue = screen.getByRole('spinbutton', { name: 'Number value' });

    fireEvent.change(numberValue, { target: { value: '' } });

    expect(onChange).toHaveBeenLastCalledWith({ value: null });
    expect(
      (screen.getByRole('combobox', { name: 'Value data type' }) as HTMLSelectElement).value,
    ).toBe('number');
    expect(
      (screen.getByRole('spinbutton', { name: 'Number value' }) as HTMLInputElement).value,
    ).toBe('');
  });

  it('resets the selected type when switching to another rule element', () => {
    const { rerender } = renderDecision(15, 'decision-1');

    rerender(
      <RuleInspectorPanel
        selectedRule={{
          id: 'decision-2',
          element_type: 'decision',
          label: 'Next decision',
          operator: '==',
          value: '15',
        }}
        onChange={vi.fn()}
        ontologyLibrary={[]}
        selectedOntologyIds={[]}
        onSelectedOntologyIdsChange={vi.fn()}
        validationIssues={[]}
        validationStatus="idle"
        collapsed={false}
        onToggleCollapsed={vi.fn()}
      />,
    );

    expect(
      (screen.getByRole('combobox', { name: 'Value data type' }) as HTMLSelectElement).value,
    ).toBe('string');
    expect((screen.getByRole('textbox', { name: 'String value' }) as HTMLInputElement).value).toBe(
      '15',
    );
  });

  it('keeps the existing reference editor outside literal typing', () => {
    const { onChange } = renderDecision(15);

    fireEvent.click(screen.getByRole('button', { name: 'Other property ($ref)' }));
    fireEvent.change(screen.getByPlaceholderText('fbo:from/fbo-dk:UseCategory'), {
      target: { value: 'https://example.org/property' },
    });

    expect(onChange).toHaveBeenLastCalledWith({ value: { $ref: 'https://example.org/property' } });
  });
});
