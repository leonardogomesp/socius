import type { ServerState } from '@valheim/contracts';
import { stateLabels } from '../lib/presentation';

const variants: Record<ServerState, string> = {
  ready: 'border-sage/60 bg-sage/20 text-green-100',
  starting: 'border-gold/50 bg-gold/10 text-gold',
  unhealthy: 'border-amber-300/50 bg-amber-300/10 text-amber-200',
  unavailable: 'border-amber-300/50 bg-amber-300/10 text-amber-200',
  missing: 'border-gold/50 bg-gold/10 text-gold',
  stopped: 'border-line/30 bg-white/5 text-paper/80',
};
export function StatusBadge({ state }: { state: ServerState }) {
  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full border px-3 py-2 text-[10px] ${variants[state]}`}
    >
      <span className="h-1 w-1 rounded-full bg-current" />
      {stateLabels[state]}
    </span>
  );
}
