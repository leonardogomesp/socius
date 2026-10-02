import { Check, LoaderCircle, X } from 'lucide-react';
import type { Operation } from '@valheim/contracts';
import { Card, EmptyState } from '../components/ui';
import { actionLabels, date } from '../lib/presentation';

export function ActivityScreen({ operations }: { operations: Operation[] }) {
  return (
    <Card>
      <h3 className="text-sm font-medium">Historico de operacoes</h3>
      {operations.length ? (
        operations.map((operation) => (
          <div
            key={operation.id}
            className="flex items-start gap-4 border-b border-line py-5 last:border-0"
          >
            <div className="rounded-full bg-sage/10 p-2 text-sage">
              {operation.status === 'running' ? (
                <LoaderCircle size={16} className="animate-spin" />
              ) : operation.status === 'failed' ? (
                <X size={16} />
              ) : (
                <Check size={16} />
              )}
            </div>
            <div className="min-w-0">
              <h4 className="text-sm font-medium">{actionLabels[operation.action]}</h4>
              <p className="mt-2 text-xs leading-6 break-words text-muted">{operation.message}</p>
              <small className="mt-2 block font-mono text-[10px] break-all text-muted">
                {operation.id}
              </small>
            </div>
            <time className="ml-auto shrink-0 text-[10px] text-muted">
              {date(operation.startedAt)}
            </time>
          </div>
        ))
      ) : (
        <EmptyState title="Tudo registrado">Suas operacoes aparecerao aqui.</EmptyState>
      )}
    </Card>
  );
}
