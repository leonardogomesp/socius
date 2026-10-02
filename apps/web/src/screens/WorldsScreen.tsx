import { useEffect, useState } from 'react';
import { Globe2, Plus } from 'lucide-react';
import type { ProfileInput } from '@valheim/contracts';
import type { SociusController } from '../hooks/useSocius';
import { isRunning } from '../lib/presentation';
import { ProfileForm } from '../components/ProfileForm';
import { Button, Card, EmptyState } from '../components/ui';
import { ConfirmDialog, type Confirmation } from '../components/ConfirmDialog';

export function WorldsScreen({ controller }: { controller: SociusController }) {
  const { catalog, snapshot, busy } = controller;
  const [selection, setSelection] = useState<string | null>(null);
  const [pendingCreation, setPendingCreation] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<
    (Confirmation & { execute: () => Promise<unknown> }) | null
  >(null);
  const selected =
    selection || (catalog?.activeProfileId ? `profile:${catalog.activeProfileId}` : 'new');
  const profile = catalog?.profiles.find((item) => `profile:${item.id}` === selected);
  const local = catalog?.worlds.find((item) => `local:${item.id}` === selected);
  const active = !!profile && profile.id === catalog?.activeProfileId;
  const running = isRunning(snapshot?.server.state);
  const unconfigured = catalog?.worlds.filter((world) => !world.profileId) || [];

  useEffect(() => {
    if (!pendingCreation) return;
    const operation = snapshot?.operations.find((item) => item.id === pendingCreation);
    if (operation?.status === 'failed') {
      setPendingCreation(null);
      return;
    }
    if (
      operation?.status !== 'succeeded' ||
      !catalog?.profiles.some((item) => item.id === operation.profileId)
    )
      return;
    setSelection(`profile:${operation.profileId}`);
    setPendingCreation(null);
  }, [pendingCreation, snapshot?.operations, catalog?.profiles]);

  async function create(settings: ProfileInput) {
    const operation = await controller.createProfile(settings);
    setPendingCreation(operation.id);
    return operation;
  }

  function save(settings: ProfileInput) {
    if (profile) {
      if (active && running)
        setConfirmation({
          title: 'Salvar e reiniciar o servidor?',
          description:
            'Os jogadores serao desconectados. O Socius fara backup antes de aplicar as configuracoes.',
          label: 'Salvar e reiniciar',
          execute: () => controller.updateProfile(profile.id, settings, true),
        });
      else void controller.updateProfile(profile.id, settings).catch(() => {});
    } else if (local)
      setConfirmation({
        title: 'Importar uma copia do mundo?',
        description:
          'Feche este mundo no Valheim. Os originais serao preservados e o progresso futuro sera salvo na copia do Socius.',
        label: 'Importar copia',
        execute: () => create(settings),
      });
    else void create(settings).catch(() => {});
  }

  return (
    <div className="grid grid-cols-[280px_minmax(0,1fr)] items-start gap-5">
      <Card className="p-4">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-sm font-medium">Seus mundos</h3>
          <Button variant="subtle" aria-label="Novo mundo" onClick={() => setSelection('new')}>
            <Plus size={17} />
          </Button>
        </div>
        <div className="grid gap-2">
          {catalog?.profiles.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setSelection(`profile:${item.id}`)}
              className={`rounded-md border p-3 text-left ${selected === `profile:${item.id}` ? 'border-sage bg-sage/10' : 'border-line hover:bg-paper'}`}
            >
              <span className="block text-sm">{item.worldName}</span>
              <small className="mt-1 block text-[10px] text-muted">
                {item.id === catalog.activeProfileId ? 'Ativo' : 'Perfil salvo'} · UDP {item.port}
              </small>
            </button>
          ))}
        </div>
        <h4 className="mt-6 mb-3 text-[10px] tracking-wider text-muted">MUNDOS LOCAIS</h4>
        <div className="grid gap-2">
          {unconfigured.map((world) => (
            <button
              key={world.id}
              type="button"
              disabled={!world.available}
              onClick={() => setSelection(`local:${world.id}`)}
              className={`rounded-md border p-3 text-left disabled:opacity-60 ${selected === `local:${world.id}` ? 'border-sage bg-sage/10' : 'border-line hover:bg-paper'}`}
            >
              <span className="block text-sm">{world.name}</span>
              <small className="mt-1 block text-[10px] leading-5 text-muted">
                {world.available ? 'Disponivel para importar' : world.reason}
              </small>
            </button>
          ))}
          {!unconfigured.length && (
            <p className="text-xs leading-6 text-muted">Nenhum outro mundo local encontrado.</p>
          )}
        </div>
        <Button className="mt-5 w-full" onClick={() => setSelection('new')}>
          <Plus size={15} />
          Criar novo mundo
        </Button>
      </Card>
      <Card>
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <h3 className="flex items-center gap-2 font-display text-2xl">
              <Globe2 size={22} className="text-sage" />
              {profile?.worldName || local?.name || 'Um novo mundo'}
            </h3>
            <p className="mt-2 text-xs leading-6 text-muted">
              {profile
                ? 'Configuracoes lembradas pelo Socius. Sua copia do servidor preserva o progresso.'
                : local
                  ? 'Importe uma copia e configure seu servidor.'
                  : 'Escolha um nome e as configuracoes do servidor.'}
            </p>
          </div>
          {profile && (
            <Button
              variant="primary"
              disabled={busy || active}
              onClick={() =>
                setConfirmation({
                  title: 'Ativar este mundo?',
                  description: running
                    ? 'Os jogadores serao desconectados. O mundo atual sera salvo e recebera um backup antes da troca.'
                    : 'O mundo sera selecionado. O servidor permanecera desligado.',
                  label: 'Ativar mundo',
                  execute: () =>
                    controller.action({ action: 'activate', profileId: profile.id, confirm: true }),
                })
              }
            >
              {active ? 'Mundo ativo' : 'Ativar mundo'}
            </Button>
          )}
        </div>
        {catalog ? (
          <ProfileForm
            key={profile ? `${profile.id}:${profile.updatedAt}` : selected}
            profile={profile}
            worldName={local?.name}
            worldId={local?.id}
            busy={busy}
            onSave={save}
          />
        ) : (
          <EmptyState title="Consultando mundos">Aguarde o catalogo local.</EmptyState>
        )}
        {profile && (
          <p className="mt-6 border-t border-line pt-4 text-[11px] leading-6 text-muted">
            Selecionar outro perfil nesta tela apenas exibe suas informacoes. Use Ativar mundo para
            trocar o servidor.
          </p>
        )}
      </Card>
      {confirmation && (
        <ConfirmDialog
          confirmation={confirmation}
          busy={busy}
          onCancel={() => setConfirmation(null)}
          onConfirm={() => {
            void confirmation
              .execute()
              .then(() => setConfirmation(null))
              .catch(() => setConfirmation(null));
          }}
        />
      )}
    </div>
  );
}
