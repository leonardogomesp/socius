import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import type { ActionRequest, ProfileInput, Snapshot } from '@valheim/contracts';
import { api } from '../api';
import { useServerConnection } from './useServerConnection';

type Command =
  | { type: 'action'; request: ActionRequest }
  | { type: 'create'; settings: ProfileInput }
  | { type: 'update'; id: string; settings: ProfileInput; confirm?: boolean };

export function useSocius() {
  const connected = useServerConnection();
  const client = useQueryClient();
  const [error, setError] = useState('');
  const snapshot = useQuery({
    queryKey: ['snapshot'],
    queryFn: api.snapshot,
    refetchInterval: 10000,
  });
  const worlds = useQuery({ queryKey: ['worlds'], queryFn: api.worlds, refetchInterval: 30000 });
  const mutation = useMutation({
    mutationFn: (command: Command) => {
      if (command.type === 'create') return api.createProfile(command.settings);
      if (command.type === 'update')
        return api.updateProfile(command.id, command.settings, command.confirm);
      return api.action(command.request);
    },
    onSuccess: (operation) => {
      setError('');
      client.setQueryData<Snapshot>(['snapshot'], (previous) =>
        previous
          ? {
              ...previous,
              busy: true,
              operations: [
                operation,
                ...previous.operations.filter((item) => item.id !== operation.id),
              ],
            }
          : previous,
      );
      void client.invalidateQueries({ queryKey: ['snapshot'] });
      void client.invalidateQueries({ queryKey: ['worlds'] });
    },
    onError: (failure) => setError(failure.message),
  });
  return {
    connected,
    snapshot: snapshot.data,
    catalog: worlds.data,
    busy: !!snapshot.data?.busy || mutation.isPending,
    error:
      error ||
      (snapshot.isError || worlds.isError ? 'Nao foi possivel consultar o painel local.' : ''),
    clearError: () => setError(''),
    action: (request: ActionRequest) => mutation.mutateAsync({ type: 'action', request }),
    createProfile: (settings: ProfileInput) => mutation.mutateAsync({ type: 'create', settings }),
    updateProfile: (id: string, settings: ProfileInput, confirm?: boolean) =>
      mutation.mutateAsync({ type: 'update', id, settings, confirm }),
  };
}
export type SociusController = ReturnType<typeof useSocius>;
