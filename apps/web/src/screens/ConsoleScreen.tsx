import { useState } from 'react';
import { Terminal } from 'lucide-react';
import type { LogLine } from '@valheim/contracts';

export function ConsoleScreen({ logs }: { logs: LogLine[] }) {
  const [filter, setFilter] = useState('');
  const visible = logs.filter((line) =>
    line.text.toLocaleLowerCase().includes(filter.toLocaleLowerCase()),
  );
  return (
    <section className="overflow-hidden rounded-lg border border-forest-light bg-forest text-paper">
      <div className="flex items-center justify-between border-b border-forest-light p-5">
        <h3 className="flex items-center gap-3 text-sm">
          <Terminal size={18} />
          Console do servidor
        </h3>
        <input
          aria-label="Filtrar logs"
          placeholder="Filtrar logs"
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
          className="rounded-md border border-sage/40 bg-forest-light px-3 py-2 text-xs"
        />
      </div>
      <div className="h-[480px] overflow-auto p-5 font-mono text-[11px] leading-6">
        {visible.length ? (
          visible.map((line, index) => (
            <div key={`${line.timestamp}:${index}`} className="flex gap-4">
              <time className="shrink-0 text-paper/40">
                {new Date(line.timestamp).toLocaleTimeString('pt-BR', {
                  timeZone: 'America/Sao_Paulo',
                })}
              </time>
              <span className="break-all whitespace-pre-wrap text-paper/80">{line.text}</span>
            </div>
          ))
        ) : (
          <p className="py-20 text-center text-paper/60">Nenhum log para exibir.</p>
        )}
      </div>
    </section>
  );
}
