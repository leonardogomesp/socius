import { useState } from 'react';
import {
  Activity,
  Box,
  ChevronRight,
  Database,
  Globe2,
  LayoutDashboard,
  LoaderCircle,
  Mountain,
  ShieldCheck,
  Terminal,
  X,
} from 'lucide-react';
import { useSocius } from './hooks/useSocius';
import { ConfirmDialog, type Confirmation } from './components/ConfirmDialog';
import { Button } from './components/ui';
import { OverviewScreen } from './screens/OverviewScreen';
import { WorldsScreen } from './screens/WorldsScreen';
import { BackupsScreen } from './screens/BackupsScreen';
import { ConsoleScreen } from './screens/ConsoleScreen';
import { ActivityScreen } from './screens/ActivityScreen';
import { actionLabels } from './lib/presentation';

export { ConfirmDialog } from './components/ConfirmDialog';
type Tab = 'overview' | 'worlds' | 'backups' | 'logs' | 'activity';
const navigation = [
  {
    id: 'overview',
    label: 'Visao geral',
    icon: LayoutDashboard,
    title: 'Um lugar para voltar.',
    description: 'Administre seu mundo e deixe a aventura continuar.',
  },
  {
    id: 'worlds',
    label: 'Mundos',
    icon: Globe2,
    title: 'Cada mundo, sua aventura.',
    description: 'Escolha um save, crie um mundo e configure seu servidor.',
  },
  {
    id: 'backups',
    label: 'Backups',
    icon: Database,
    title: 'Seu progresso, protegido.',
    description: 'Copias verificadas e separadas por mundo.',
  },
  {
    id: 'logs',
    label: 'Console',
    icon: Terminal,
    title: 'Por dentro do servidor.',
    description: 'Logs reais da sessao atual, com senhas removidas.',
  },
  {
    id: 'activity',
    label: 'Atividade',
    icon: Activity,
    title: 'Tudo que aconteceu.',
    description: 'Historico local das operacoes e seus resultados.',
  },
] as const;

export function App() {
  const controller = useSocius();
  const [tab, setTab] = useState<Tab>('overview');
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const page = navigation.find((item) => item.id === tab)!;
  const activeOperation = controller.snapshot?.operations.find(
    (operation) => operation.status === 'running',
  );
  const latest = controller.snapshot?.operations[0];
  return (
    <div className="min-w-[1100px]">
      <aside className="fixed inset-y-0 left-0 flex w-[235px] flex-col bg-forest px-5 py-8 text-paper">
        <button
          type="button"
          className="mb-16 flex items-center gap-3 px-2 text-left"
          onClick={() => setTab('overview')}
        >
          <span className="rounded-lg border border-gold/40 p-2 text-gold">
            <Mountain size={25} />
          </span>
          <span className="font-display text-2xl font-bold tracking-widest">
            SOCIUS
            <small className="mt-1 block font-sans text-[8px] font-normal tracking-[0.3em] text-gold">
              VALHEIM MANAGER
            </small>
          </span>
        </button>
        <span className="mb-4 px-3 text-[9px] tracking-[0.2em] text-paper/40">SEU SERVIDOR</span>
        <nav aria-label="Navegacao principal" className="grid gap-2">
          {navigation.map((item) => (
            <button
              key={item.id}
              type="button"
              aria-current={tab === item.id ? 'page' : undefined}
              className={`flex items-center gap-3 rounded-md border px-4 py-3 text-xs ${tab === item.id ? 'border-sage/40 bg-sage/25 text-paper' : 'border-transparent text-paper/60 hover:bg-forest-light'}`}
              onClick={() => setTab(item.id)}
            >
              <item.icon size={18} />
              {item.label}
              {item.id === 'backups' && !!controller.snapshot?.backups.length && (
                <span className="ml-auto rounded border border-sage/40 px-1.5 text-[10px]">
                  {controller.snapshot.backups.length}
                </span>
              )}
            </button>
          ))}
        </nav>
        <div className="mt-auto border-t border-sage/30 pt-6">
          <p className="flex items-center gap-3 text-xs">
            <ShieldCheck size={18} />
            <span>
              Ambiente pessoal
              <small className="mt-1 block text-[10px] text-paper/45">
                Acesso somente neste PC
              </small>
            </span>
          </p>
          <p className="mt-6 font-display text-sm text-paper/50 italic">Seu mundo. No seu ritmo.</p>
          <span className="mt-5 block text-[9px] text-paper/40">v1.1 · Vanilla</span>
        </div>
      </aside>
      <div className="ml-[235px]">
        <header className="flex h-[72px] items-center justify-between border-b border-line px-10 text-[11px] text-muted">
          <div className="flex items-center gap-3">
            Servidor pessoal
            <ChevronRight size={14} />
            <strong className="font-medium text-ink">{page.label}</strong>
          </div>
          <div className="connection flex items-center gap-2">
            <span
              className={`h-1.5 w-1.5 rounded-full ${controller.connected ? 'bg-sage' : 'bg-amber-600'}`}
            />
            {controller.connected ? 'Tempo real conectado' : 'Atualizacao por consulta'}
            <span className="ml-3 rounded border border-line px-2 py-1 text-[8px] tracking-widest">
              LOCAL
            </span>
          </div>
        </header>
        <main className="mx-auto max-w-[1500px] px-10 pt-10">
          <div className="mb-7 flex items-center justify-between">
            <div>
              <span className="text-[9px] tracking-[0.2em] text-muted">PAINEL DO SERVIDOR</span>
              <h1 className="mt-3 font-display text-[38px]">{page.title}</h1>
              <p className="mt-2 text-xs leading-6 text-muted">{page.description}</p>
            </div>
            <span className="flex items-center gap-2 text-[9px] tracking-widest text-muted">
              <Box size={15} />
              VALHEIM · VANILLA
            </span>
          </div>
          {controller.error && (
            <div
              role="alert"
              className="mb-5 flex items-center justify-between rounded-md border border-red-200 bg-red-50 p-4 text-xs text-red-800"
            >
              {controller.error}
              <Button variant="subtle" aria-label="Fechar aviso" onClick={controller.clearError}>
                <X size={15} />
              </Button>
            </div>
          )}
          {activeOperation && (
            <div
              role="status"
              className="mb-5 flex items-center gap-3 rounded-md border border-line bg-sage/10 p-4 text-xs text-sage"
            >
              <LoaderCircle size={18} className="animate-spin" />
              <div>
                <strong>{actionLabels[activeOperation.action]}</strong>
                <p className="mt-1">{activeOperation.message}</p>
              </div>
            </div>
          )}
          {latest?.status === 'failed' && !activeOperation && (
            <div
              role="alert"
              className="mb-5 rounded-md border border-red-200 bg-red-50 p-4 text-xs leading-6 text-red-800"
            >
              Ultima operacao falhou: {latest.message}
            </div>
          )}
          {tab === 'overview' && (
            <OverviewScreen
              controller={controller}
              onWorlds={() => setTab('worlds')}
              onBackups={() => setTab('backups')}
              onConfirm={setConfirmation}
            />
          )}
          {tab === 'worlds' && <WorldsScreen controller={controller} />}
          {tab === 'backups' && (
            <BackupsScreen controller={controller} onConfirm={setConfirmation} />
          )}
          {tab === 'logs' && <ConsoleScreen logs={controller.snapshot?.logs || []} />}
          {tab === 'activity' && (
            <ActivityScreen operations={controller.snapshot?.operations || []} />
          )}
          <footer className="mt-9 flex justify-between border-t border-line py-6 text-[10px] text-muted">
            <span className="flex items-center gap-2">
              <Mountain size={14} />
              SOCIUS
            </span>
            <span>Feito para cuidar do seu mundo.</span>
          </footer>
        </main>
      </div>
      {confirmation && (
        <ConfirmDialog
          confirmation={confirmation}
          busy={controller.busy}
          onCancel={() => setConfirmation(null)}
          onConfirm={() => {
            void controller
              .action(confirmation.request!)
              .then(() => setConfirmation(null))
              .catch(() => setConfirmation(null));
          }}
        />
      )}
    </div>
  );
}
