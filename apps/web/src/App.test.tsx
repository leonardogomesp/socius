// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom/vitest';
import { ConfirmDialog } from './App';
afterEach(cleanup);
describe('Restore confirmation', () => {
  it('explains recovery, focuses cancel, and requires a click', async () => {
    const confirm = vi.fn();
    render(
      <ConfirmDialog
        confirmation={{
          title: 'Restaurar este backup?',
          description: 'Uma copia de recuperacao sera criada.',
          label: 'Criar copia e restaurar',
          request: { action: 'restore', confirm: true },
        }}
        busy={false}
        onCancel={() => {}}
        onConfirm={confirm}
      />,
    );
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancelar' })).toHaveFocus();
    expect(confirm).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Criar copia e restaurar' }));
    expect(confirm).toHaveBeenCalledOnce();
  });
  it('supports Escape and disables pending confirmation', async () => {
    const cancel = vi.fn();
    const props = {
      confirmation: {
        title: 'Restaurar?',
        description: 'Aviso',
        label: 'Restaurar',
        request: { action: 'restore' as const },
      },
      onCancel: cancel,
      onConfirm: () => {},
    };
    const { rerender } = render(<ConfirmDialog {...props} busy={false} />);
    await userEvent.keyboard('{Escape}');
    expect(cancel).toHaveBeenCalledOnce();
    rerender(<ConfirmDialog {...props} busy />);
    expect(screen.getByRole('button', { name: 'Restaurar' })).toBeDisabled();
  });
});
