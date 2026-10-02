import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { io } from 'socket.io-client';
import type { Operation, Snapshot } from '@valheim/contracts';
import { resetSession, token } from '../api';

export function useServerConnection() {
  const [connected, setConnected] = useState(false);
  const client = useQueryClient();
  useEffect(() => {
    let active = true;
    let socket: ReturnType<typeof io> | undefined;
    void token()
      .then((value) => {
        if (!active) return;
        socket = io({ auth: { token: value }, transports: ['polling', 'websocket'] });
        socket.on('connect', () => {
          setConnected(true);
          void client.invalidateQueries({ queryKey: ['worlds'] });
        });
        socket.on('disconnect', () => setConnected(false));
        socket.on('connect_error', (error) => {
          setConnected(false);
          if (error.message !== 'Sessao local invalida.') return;
          resetSession();
          void token()
            .then((newToken) => {
              if (!active || !socket) return;
              socket.auth = { token: newToken };
              socket.connect();
            })
            .catch(() => setConnected(false));
        });
        socket.on('snapshot', (snapshot: Snapshot) => client.setQueryData(['snapshot'], snapshot));
        socket.on('operation', (operation: Operation) => {
          client.setQueryData<Snapshot>(['snapshot'], (previous) =>
            previous
              ? {
                  ...previous,
                  busy: operation.status === 'running',
                  operations: [
                    operation,
                    ...previous.operations.filter((item) => item.id !== operation.id),
                  ],
                }
              : previous,
          );
          if (operation.status !== 'running') {
            void client.invalidateQueries({ queryKey: ['worlds'] });
            void client.invalidateQueries({ queryKey: ['snapshot'] });
          }
        });
      })
      .catch(() => setConnected(false));
    const offline = () => {
      socket?.disconnect();
      setConnected(false);
    };
    const online = () => socket?.connect();
    window.addEventListener('offline', offline);
    window.addEventListener('online', online);
    return () => {
      active = false;
      window.removeEventListener('offline', offline);
      window.removeEventListener('online', online);
      socket?.disconnect();
    };
  }, [client]);
  return connected;
}
