// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom/vitest';
import type { Profile } from '@valheim/contracts';
import { ProfileForm } from './ProfileForm';
import { api } from '../api';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
const profile: Profile = {
  id: '123',
  worldName: 'MyWorld',
  serverName: 'Saved server',
  port: 3456,
  crossplay: false,
  public: true,
  source: 'local',
  generated: true,
  createdAt: '',
  updatedAt: '',
  lastStartedAt: null,
};
describe('Profile settings form', () => {
  it('loads remembered settings and omits the password unless replaced', async () => {
    const save = vi.fn();
    render(<ProfileForm profile={profile} busy={false} onSave={save} />);
    expect(screen.getByLabelText('Nome do servidor')).toHaveValue('Saved server');
    expect(screen.getByLabelText('Porta UDP principal')).toHaveValue(3456);
    expect(screen.getByLabelText('Substituir senha')).toHaveValue('');
    expect(screen.getByLabelText('Crossplay')).not.toBeChecked();
    await userEvent.click(screen.getByRole('button', { name: 'Salvar configuracoes' }));
    expect(save).toHaveBeenCalledWith({
      serverName: 'Saved server',
      port: 3456,
      crossplay: false,
      public: true,
    });
  });
  it('fetches a stored password only on explicit reveal and hides it again', async () => {
    const read = vi.spyOn(api, 'password').mockResolvedValue({ password: 'private-secret' });
    render(<ProfileForm profile={profile} busy={false} onSave={() => {}} />);
    expect(read).not.toHaveBeenCalled();
    expect(screen.queryByText('private-secret')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Mostrar senha' }));
    expect(await screen.findByText('private-secret')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Ocultar senha' }));
    expect(screen.queryByText('private-secret')).not.toBeInTheDocument();
  });
});
