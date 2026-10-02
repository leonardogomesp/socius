import { useState } from 'react';
import {
  Clock3,
  Copy,
  Cpu,
  Database,
  HardDrive,
  Play,
  RotateCcw,
  ShieldCheck,
  Square,
} from 'lucide-react';
import type { Confirmation } from '../components/ConfirmDialog';
import { Button, Card } from '../components/ui';
import { StatusBadge } from '../components/StatusBadge';
import { WorldLandscape } from '../components/WorldLandscape';
import type { SociusController } from '../hooks/useSocius';
import { date, isRunning, size } from '../lib/presentation';

interface Props {
  controller: SociusController;
  onWorlds: () => void;
  onBackups: () => void;
  onConfirm: (confirmation: Confirmation) => void;
}
export function OverviewScreen({ controller, onWorlds, onBackups, onConfirm }: Props) {
  const [copied, setCopied] = useState(false);
  const { snapshot, catalog, busy } = controller;
  const server = snapshot?.server;
  const running = isRunning(server?.state);
  const available = !!server && server.state !== 'unavailable';
  const metrics = [
    {
      label: 'CPU do servidor',
      value: server?.cpuPercent == null ? '—' : `${server.cpuPercent.toFixed(1)}%`,
      hint: '100% corresponde a um nucleo',
      icon: Cpu,
    },
    {
      label: 'Memoria em uso',
      value: size(server?.memoryBytes ?? null),
      hint: `Limite do Docker: ${size(server?.memoryLimitBytes ?? null)}`,
      icon: HardDrive,
    },
    {
      label: 'Inicio da sessao',
      value: date(server?.startedAt),
      hint: 'Horario de Brasilia',
      icon: Clock3,
    },
    {
      label: 'Ultimo backup',
      value: date(snapshot?.backups[0]?.createdAt),
      hint: snapshot?.backups[0]
        ? `${snapshot.backups[0].fileCount} arquivos verificados`
        : 'Crie sua primeira copia',
      icon: Database,
    },
  ];
  return (
    <>
      <section className="relative overflow-hidden rounded-xl border border-forest-light bg-forest p-8 text-paper">
        <WorldLandscape />
        <div className="relative">
          <div className="flex items-center justify-between">
            <span className="text-[9px] tracking-[0.2em] text-paper/60">MUNDO ATIVO</span>
            {server && <StatusBadge state={server.state} />}
          </div>
          <h2 className="mt-4 font-display text-[38px]">
            {catalog?.activeProfileId ? server?.worldName : 'Escolha seu mundo'}
          </h2>
          <p className="mt-1 text-xs text-paper/65">
            {server?.serverName || 'Socius'} ·{' '}
            {server?.crossplay ? 'Crossplay habilitado' : 'Conexao Steam'}
          </p>
          <p className="mt-5 max-w-2xl text-xs leading-6 text-paper/85">
            {server?.message || 'Consultando o ambiente local...'}
          </p>
          <div className="mt-5 flex gap-2">
            <Button
              variant="light"
              disabled={busy || !available || running || !catalog?.configured}
              onClick={() => void controller.action({ action: 'start' }).catch(() => {})}
            >
              <Play size={16} />
              Iniciar servidor
            </Button>
            <Button
              variant="dark"
              disabled={busy || !available || !running}
              onClick={() =>
                onConfirm({
                  title: 'Parar servidor?',
                  description:
                    'Os jogadores serao desconectados. O mundo sera salvo antes do encerramento.',
                  label: 'Parar servidor',
                  request: { action: 'stop' },
                })
              }
            >
              <Square size={16} />
              Parar
            </Button>
            <Button
              variant="dark"
              aria-label="Reiniciar servidor"
              disabled={busy || !available || !running}
              onClick={() =>
                onConfirm({
                  title: 'Reiniciar servidor?',
                  description: 'Os jogadores serao desconectados durante o reinicio.',
                  label: 'Reiniciar',
                  request: { action: 'restart' },
                })
              }
            >
              <RotateCcw size={16} />
            </Button>
            <Button variant="dark" onClick={onWorlds}>
              Escolher mundo
            </Button>
          </div>
        </div>
      </section>
      <div className="my-5 grid grid-cols-4 gap-4">
        {metrics.map((metric) => (
          <Card key={metric.label} className="min-w-0 p-5">
            <div className="flex items-center justify-between text-muted">
              <span className="text-[11px]">{metric.label}</span>
              <metric.icon size={17} />
            </div>
            <strong className="mt-4 block font-display text-2xl font-normal">{metric.value}</strong>
            <small className="mt-2 block text-[10px] leading-5 text-muted">{metric.hint}</small>
          </Card>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-5">
        <Card>
          <h3 className="flex items-center gap-2 text-sm font-medium">
            <ShieldCheck size={17} className="text-sage" />
            Como entrar no mundo
          </h3>
          <p className="my-5 text-xs leading-6 text-muted">
            Use o codigo no Valheim. Consulte ou altere a senha na tela Mundos.
          </p>
          <div className="join-code flex items-center gap-3 rounded-md border border-dashed border-line bg-paper p-4">
            <span className="text-[9px] tracking-wider text-muted">CODIGO DE ENTRADA</span>
            <strong className="ml-auto font-mono text-2xl tracking-widest text-sage">
              {server?.joinCode || '—'}
            </strong>
            <Button
              variant="subtle"
              aria-label="Copiar codigo de entrada"
              disabled={!server?.joinCode}
              onClick={() => {
                void navigator.clipboard
                  .writeText(server!.joinCode!)
                  .then(() => setCopied(true))
                  .catch(() => setCopied(false));
              }}
            >
              <Copy size={16} />
            </Button>
          </div>
          <p className="mt-4 text-[11px] text-muted">
            {copied ? 'Codigo copiado.' : 'O codigo aparece quando o servidor estiver pronto.'}
          </p>
        </Card>
        <Card>
          <div className="flex items-center justify-between">
            <h3 className="flex items-center gap-2 text-sm font-medium">
              <Database size={17} className="text-sage" />
              Proteja sua aventura
            </h3>
            <Button variant="subtle" onClick={onBackups}>
              Ver backups
            </Button>
          </div>
          <p className="my-4 text-xs leading-6 text-muted">
            Crie uma copia antes de uma nova expedicao. O servidor sera parado e retomado se estava
            ligado.
          </p>
          <Button
            className="w-full"
            disabled={busy || !catalog?.configured || !available}
            onClick={() =>
              onConfirm({
                title: 'Criar backup agora?',
                description:
                  'O servidor sera salvo e parado durante a copia, depois retomado se estava ligado.',
                label: 'Criar backup',
                request: { action: 'backup' },
              })
            }
          >
            Criar backup agora
          </Button>
          <p className="mt-4 text-[11px] leading-6 text-muted">
            Backup diario a partir das 04h, horario de Brasilia, enquanto o painel estiver aberto.
            Mantemos sete copias por mundo.
          </p>
        </Card>
      </div>
      <p className="mt-6 text-xs leading-6 text-muted">
        O servidor funciona com seu jogo fechado. Mantenha o PC ligado e sem suspensao. Deixe o
        painel aberto para os backups diarios.
      </p>
    </>
  );
}
