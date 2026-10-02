import type {
  ActionRequest,
  Operation,
  ProfileInput,
  Snapshot,
  WorldCatalog,
} from '@valheim/contracts';

let session: Promise<string> | undefined;
export function resetSession() {
  session = undefined;
}
export function token() {
  session ??= fetch('/api/session')
    .then(async (response) => {
      if (!response.ok) throw new Error('Nao foi possivel conectar ao painel local.');
      return ((await response.json()) as { token: string }).token;
    })
    .catch((error) => {
      session = undefined;
      throw error;
    });
  return session;
}
export async function request<T>(
  url: string,
  body?: unknown,
  method = body === undefined ? 'GET' : 'POST',
): Promise<T> {
  const response = await fetch(url, {
    method,
    headers: {
      'x-manager-token': await token(),
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const result = await response.json();
  if (!response.ok) {
    if (response.status === 401) resetSession();
    throw new Error(result.error || 'A operacao falhou.');
  }
  return result as T;
}
export const api = {
  snapshot: () => request<Snapshot>('/api/snapshot'),
  worlds: () => request<WorldCatalog>('/api/worlds'),
  action: (body: ActionRequest) => request<Operation>('/api/operations', body),
  createProfile: (body: ProfileInput) => request<Operation>('/api/profiles', body),
  updateProfile: (id: string, settings: ProfileInput, confirm?: boolean) =>
    request<Operation>(`/api/profiles/${id}`, { settings, confirm }, 'PUT'),
  password: (id: string) => request<{ password: string }>(`/api/profiles/${id}/password`),
};
