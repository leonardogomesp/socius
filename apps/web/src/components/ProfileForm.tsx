import { useState } from 'react';
import type { Profile, ProfileInput } from '@valheim/contracts';
import { api } from '../api';
import { Button, Field } from './ui';

interface Props {
  profile?: Profile;
  worldName?: string;
  worldId?: string;
  busy: boolean;
  onSave: (settings: ProfileInput) => void;
}
export function ProfileForm({ profile, worldName, worldId, busy, onSave }: Props) {
  const [name, setName] = useState(profile?.worldName || worldName || '');
  const [serverName, setServerName] = useState(profile?.serverName || 'Socius');
  const [password, setPassword] = useState('');
  const [port, setPort] = useState(String(profile?.port || 2456));
  const [crossplay, setCrossplay] = useState(profile?.crossplay ?? true);
  const [isPublic, setPublic] = useState(profile?.public ?? false);
  const [revealed, setRevealed] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const [fetchingPassword, setFetchingPassword] = useState(false);

  async function readPassword(copy: boolean) {
    if (!profile) return;
    setFetchingPassword(true);
    setNotice('');
    try {
      const result = await api.password(profile.id);
      if (copy) {
        await navigator.clipboard.writeText(result.password);
        setNotice('Senha copiada.');
      } else setRevealed(result.password);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Nao foi possivel consultar a senha.');
    } finally {
      setFetchingPassword(false);
    }
  }

  return (
    <form
      className="grid gap-5"
      onSubmit={(event) => {
        event.preventDefault();
        const settings: ProfileInput = {
          serverName,
          port: Number(port),
          crossplay,
          public: isPublic,
        };
        if (password) settings.password = password;
        if (!profile) {
          if (worldId) settings.worldId = worldId;
          else settings.worldName = name;
        }
        onSave(settings);
        setRevealed(null);
      }}
    >
      <div className="grid grid-cols-2 gap-5">
        <Field
          label="Nome do mundo"
          value={name}
          disabled={!!profile || !!worldId || busy}
          required
          maxLength={64}
          onChange={(event) => setName(event.target.value)}
          hint={
            profile
              ? 'O nome do save permanece fixo neste perfil.'
              : 'O mundo sera gerado no primeiro inicio.'
          }
        />
        <Field
          label="Nome do servidor"
          value={serverName}
          disabled={busy}
          required
          maxLength={64}
          onChange={(event) => setServerName(event.target.value)}
        />
        <Field
          label="Porta UDP principal"
          type="number"
          value={port}
          min={1024}
          max={65534}
          disabled={busy}
          required
          onChange={(event) => setPort(event.target.value)}
          hint={`Segunda porta UDP: ${Number(port) + 1}`}
        />
        <Field
          label={profile ? 'Substituir senha' : 'Senha'}
          type="password"
          value={password}
          disabled={busy}
          required={!profile}
          minLength={5}
          maxLength={64}
          autoComplete="new-password"
          placeholder={
            profile ? 'Deixe vazio para manter a senha atual' : 'Minimo de cinco caracteres'
          }
          onChange={(event) => setPassword(event.target.value)}
          hint="Use de 5 a 64 caracteres, sem espacos."
        />
      </div>
      {profile && (
        <div className="rounded-lg border border-line bg-paper p-4">
          <span className="text-xs font-medium">Senha atual</span>
          <div className="mt-2 flex items-center gap-3">
            <span className="min-w-32 font-mono text-sm break-all">{revealed || '••••••••'}</span>
            <Button
              disabled={busy || fetchingPassword}
              onClick={() => {
                if (revealed) setRevealed(null);
                else void readPassword(false);
              }}
            >
              {revealed ? 'Ocultar senha' : 'Mostrar senha'}
            </Button>
            <Button disabled={busy || fetchingPassword} onClick={() => void readPassword(true)}>
              Copiar senha
            </Button>
          </div>
          {notice && (
            <p role="status" className="mt-2 text-xs text-muted">
              {notice}
            </p>
          )}
        </div>
      )}
      <div className="flex gap-8 text-xs">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={crossplay}
            disabled={busy}
            onChange={(event) => setCrossplay(event.target.checked)}
          />
          Crossplay
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={isPublic}
            disabled={busy}
            onChange={(event) => setPublic(event.target.checked)}
          />
          Listar servidor publicamente
        </label>
      </div>
      <Button type="submit" variant="primary" disabled={busy} className="justify-self-start">
        {profile ? 'Salvar configuracoes' : worldId ? 'Importar e salvar perfil' : 'Criar mundo'}
      </Button>
      {!profile && (
        <p className="text-xs leading-6 text-muted">
          {worldId
            ? 'Feche o mundo no Valheim antes de importar. Uma copia sera usada pelo Socius.'
            : 'A criacao salva o perfil; ative o mundo e inicie o servidor para gerar o mapa.'}
        </p>
      )}
    </form>
  );
}
