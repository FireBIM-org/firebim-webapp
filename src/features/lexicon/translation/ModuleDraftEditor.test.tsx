// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { listOntologies } = vi.hoisted(() => ({ listOntologies: vi.fn() }));

vi.mock('@/utils/api-client', () => ({ default: { listOntologies } }));

import { USER_ONTOLOGY_LIBRARY_STORAGE_KEY } from '@/features/ontologies/library';

import ModuleDraftEditor from './ModuleDraftEditor';

function ontology(country: string) {
  return { ontology_family: 'fbo', country, latest_version: '2026.09.04' };
}

describe('destination module library discovery', () => {
  beforeEach(() => {
    localStorage.clear();
    listOntologies.mockReset();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('loads all backend identities on mount, retaining local entries and deduplicating identities', async () => {
    localStorage.setItem(
      USER_ONTOLOGY_LIBRARY_STORAGE_KEY,
      JSON.stringify([
        {
          id: 'custom/local/v1',
          ontology_family: 'custom',
          country: 'local',
          version: 'v1',
          label: 'Custom',
          description: 'Local ontology',
        },
        {
          id: 'fbo/core/2026.09.04',
          ontology_family: 'fbo',
          country: 'core',
          version: '2026.09.04',
          label: 'Core',
          description: 'Previously added release',
        },
      ]),
    );
    let resolve!: (value: unknown) => void;
    listOntologies.mockReturnValue(
      new Promise((done) => {
        resolve = done;
      }),
    );
    const onChange = vi.fn();
    render(<ModuleDraftEditor modules={[]} onChange={onChange} />);

    expect(screen.queryByLabelText('Family')).toBeNull();
    expect(screen.queryByLabelText('Country / module key')).toBeNull();
    expect(screen.getByText(/Loading ontology library/)).toBeTruthy();
    const select = screen.getByRole('combobox', { name: 'Use a library identity' });
    expect(within(select).getByRole('option', { name: 'custom/local' })).toBeTruthy();
    await act(async () =>
      resolve({ ontologies: [ontology('core'), ontology('be'), ontology('pt'), ontology('dk')] }),
    );

    expect(listOntologies).toHaveBeenCalledOnce();
    for (const identity of ['fbo/core', 'fbo/be', 'fbo/pt', 'fbo/dk', 'custom/local']) {
      expect(within(select).getAllByRole('option', { name: identity })).toHaveLength(1);
    }
    expect(screen.queryByText(/Loading ontology library/)).toBeNull();
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.change(select, { target: { value: 'fbo/be' } });
    expect((select as HTMLSelectElement).value).toBe('fbo/be');
    fireEvent.click(screen.getByRole('button', { name: 'Add module' }));
    expect(onChange).toHaveBeenCalledWith([
      {
        family: 'fbo',
        country: 'be',
        version: '2026.09.04',
        dependencies: [],
      },
    ]);
    expect((select as HTMLSelectElement).value).toBe('');
  });

  it('keeps cached identities usable after failure, and supports retry', async () => {
    listOntologies.mockRejectedValueOnce(new Error('Offline'));
    const onChange = vi.fn();
    render(<ModuleDraftEditor modules={[]} onChange={onChange} />);

    await screen.findByText(/Could not load all available ontologies/);
    expect(screen.getByRole('option', { name: 'fbo/dk' })).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Use a library identity'), {
      target: { value: 'fbo/dk' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add module' }));
    expect(onChange).toHaveBeenCalledWith([
      {
        family: 'fbo',
        country: 'dk',
        version: '2026.09.04',
        dependencies: [],
      },
    ]);

    listOntologies.mockResolvedValueOnce({ ontologies: [ontology('core')] });
    fireEvent.click(screen.getByRole('button', { name: 'Retry ontology library' }));
    await screen.findByRole('option', { name: 'fbo/core' });
    expect(screen.queryByText(/Could not load all available ontologies/)).toBeNull();
    expect(listOntologies).toHaveBeenCalledTimes(2);
  });

  it('shows discovered ontologies even when browser cache writes are blocked', async () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('Blocked');
    });
    listOntologies.mockResolvedValue({ ontologies: [ontology('core')] });
    render(<ModuleDraftEditor modules={[]} onChange={vi.fn()} />);

    await screen.findByRole('option', { name: 'fbo/core' });
    await waitFor(() => expect(screen.queryByText(/Loading ontology library/)).toBeNull());
    expect(screen.queryByText(/Could not load all available ontologies/)).toBeNull();
  });

  it('requires a library selection and prevents adding duplicate modules', async () => {
    listOntologies.mockResolvedValue({ ontologies: [ontology('core')] });
    const onChange = vi.fn();
    render(
      <ModuleDraftEditor
        modules={[
          {
            family: 'fbo',
            country: 'core',
            version: '2026.09.04',
            dependencies: [],
          },
        ]}
        onChange={onChange}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Add module' }));
    expect(screen.getByRole('alert').textContent).toMatch(/Choose a library identity/);
    await screen.findByRole('option', { name: 'fbo/core' });
    fireEvent.change(screen.getByLabelText('Use a library identity'), {
      target: { value: 'fbo/core' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add module' }));
    expect(screen.getByRole('alert').textContent).toMatch(/already in the draft/);
    expect(onChange).not.toHaveBeenCalled();
  });
});
