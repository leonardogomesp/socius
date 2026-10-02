export type ServerState =
  'unavailable' | 'missing' | 'stopped' | 'starting' | 'ready' | 'unhealthy';
export type Action =
  | 'start'
  | 'stop'
  | 'restart'
  | 'backup'
  | 'restore'
  | 'import'
  | 'create-profile'
  | 'update-profile'
  | 'activate';
export interface ProfileSettings {
  serverName: string;
  port: number;
  crossplay: boolean;
  public: boolean;
}
export interface Profile extends ProfileSettings {
  id: string;
  worldName: string;
  source: 'local' | 'new' | 'migrated';
  createdAt: string;
  updatedAt: string;
  lastStartedAt: string | null;
  generated: boolean;
}
export interface ProfileInput extends ProfileSettings {
  worldName?: string;
  worldId?: string;
  password?: string;
}
export interface ServerStatus {
  profileId: string | null;
  state: ServerState;
  serverName: string;
  worldName: string;
  crossplay: boolean;
  cpuPercent: number | null;
  memoryBytes: number | null;
  memoryLimitBytes: number | null;
  startedAt: string | null;
  joinCode: string | null;
  message: string;
  checkedAt: string;
}
export interface LogLine {
  timestamp: string;
  text: string;
}
export interface Operation {
  id: string;
  profileId?: string | null;
  action: Action;
  status: 'running' | 'succeeded' | 'failed';
  message: string;
  startedAt: string;
  finishedAt?: string;
  recoveryId?: string;
}
export interface Backup {
  id: string;
  profileId: string | null;
  createdAt: string;
  kind: 'manual' | 'daily' | 'recovery';
  sizeBytes: number;
  fileCount: number;
  worldName: string;
}
export interface WorldCandidate {
  id: string;
  name: string;
  layout: 'legacy' | 'directory' | null;
  sizeBytes: number;
  available: boolean;
  reason?: string;
  profileId?: string;
}
export interface WorldCatalog {
  worlds: WorldCandidate[];
  profiles: Profile[];
  activeProfileId: string | null;
  configured: boolean;
}
export interface Snapshot {
  server: ServerStatus;
  operations: Operation[];
  backups: Backup[];
  logs: LogLine[];
  busy: boolean;
}
export interface ActionRequest {
  action: Action;
  profileId?: string;
  backupId?: string;
  worldId?: string;
  settings?: ProfileInput;
  confirm?: boolean;
}
