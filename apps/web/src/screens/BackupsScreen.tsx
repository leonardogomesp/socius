import type { SociusController } from '../hooks/useSocius';
import type { Confirmation } from '../components/ConfirmDialog';
import { Button, Card, EmptyState } from '../components/ui';
import { date, size } from '../lib/presentation';

export function BackupsScreen({
  controller,
  onConfirm,
}: {
  controller: SociusController;
  onConfirm: (confirmation: Confirmation) => void;
}) {
  const backups = controller.snapshot?.backups || [];
  return (
    <Card>
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-medium">Backups do mundo ativo</h3>
          <p className="mt-2 text-xs text-muted">
            Sete copias regulares. Copias de recuperacao sao preservadas.
          </p>
        </div>
        <Button
          disabled={controller.busy || !controller.catalog?.activeProfileId}
          onClick={() =>
            onConfirm({
              title: 'Criar backup?',
              description: 'O servidor sera parado durante a copia e retomado se estava ligado.',
              label: 'Criar backup',
              request: { action: 'backup' },
            })
          }
        >
          Criar backup
        </Button>
      </div>
      {backups.length ? (
        <table className="mt-6 w-full text-left text-xs">
          <thead className="border-b border-line text-[10px] text-muted">
            <tr>
              <th className="py-4">DATA</th>
              <th>MUNDO</th>
              <th>TIPO</th>
              <th>TAMANHO</th>
              <th>
                <span className="sr-only">Acoes</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {backups.map((backup) => (
              <tr key={backup.id} className="border-b border-line">
                <td className="py-5">
                  {date(backup.createdAt)}
                  <small className="mt-1 block text-muted">{backup.fileCount} arquivos</small>
                </td>
                <td>{backup.worldName}</td>
                <td>
                  {backup.kind === 'recovery'
                    ? 'Recuperacao'
                    : backup.kind === 'daily'
                      ? 'Diario'
                      : 'Manual'}
                </td>
                <td>{size(backup.sizeBytes)}</td>
                <td className="text-right">
                  <Button
                    disabled={controller.busy}
                    onClick={() =>
                      onConfirm({
                        title: 'Restaurar este backup?',
                        description: `O mundo sera substituido pelo save de ${date(backup.createdAt)}. Antes disso, criaremos uma copia de recuperacao. Em caso de falha, o servidor permanecera desligado.`,
                        label: 'Criar copia e restaurar',
                        request: {
                          action: 'restore',
                          profileId: backup.profileId || undefined,
                          backupId: backup.id,
                          confirm: true,
                        },
                      })
                    }
                  >
                    Restaurar
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <EmptyState title="Seu primeiro backup">
          Crie uma copia para proteger o mundo ativo.
        </EmptyState>
      )}
    </Card>
  );
}
