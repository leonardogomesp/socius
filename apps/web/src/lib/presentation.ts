import type { Action, ServerState } from '@valheim/contracts';

export const actionLabels: Record<Action, string> = {
  start: 'Iniciar servidor',
  stop: 'Parar servidor',
  restart: 'Reiniciar servidor',
  backup: 'Criar backup',
  restore: 'Restaurar mundo',
  import: 'Importar mundo',
  'create-profile': 'Criar mundo',
  'update-profile': 'Salvar configuracoes',
  activate: 'Ativar mundo',
};
export const stateLabels: Record<ServerState, string> = {
  unavailable: 'Ambiente indisponivel',
  missing: 'Aguardando configuracao',
  stopped: 'Desligado',
  starting: 'Iniciando',
  ready: 'Pronto para jogar',
  unhealthy: 'Precisa de atencao',
};
export function size(bytes: number | null) {
  if (bytes === null) return '—';
  return bytes >= 1024 ** 3
    ? `${(bytes / 1024 ** 3).toFixed(2)} GB`
    : `${(bytes / 1024 ** 2).toFixed(1)} MB`;
}
export function date(value: string | null | undefined) {
  return value
    ? new Date(value).toLocaleString('pt-BR', {
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'America/Sao_Paulo',
      })
    : '—';
}
export function isRunning(state?: ServerState) {
  return state === 'ready' || state === 'starting' || state === 'unhealthy';
}
