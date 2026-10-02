import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { ActionRequest, Operation, Snapshot, Backup, WorldCatalog } from '@valheim/contracts';
import type { DockerPort } from './docker';
import { Storage, atomicJson, exists } from './storage';
import { ProfileRepository } from './profiles';
import { AppError } from './errors';
import { redact } from './config';

export class Manager extends EventEmitter {
  operations: Operation[] = [];
  busy = false;
  private active: Promise<void> | null = null;
  private polling = false;
  private shuttingDown = false;
  private snapshot: Snapshot | null = null;

  constructor(
    public readonly docker: DockerPort,
    public readonly storage: Storage,
    public readonly profiles?: ProfileRepository,
  ) {
    super();
  }

  async init() {
    await this.storage.init();
    const history = path.join(this.storage.config.historyDir, 'operations.json');
    if (await exists(history)) {
      this.operations = JSON.parse(await fs.readFile(history, 'utf8'));
      for (const operation of this.operations) {
        operation.profileId ??= this.profiles?.activeId ?? this.storage.config.profileId;
        if (operation.status !== 'running') continue;
        operation.status = 'failed';
        operation.finishedAt = new Date().toISOString();
        operation.message =
          'O painel foi interrompido. Confira o estado real antes de repetir a operacao.';
      }
      await this.persist();
    }
    await this.refresh();
  }

  private sanitize(text: string) {
    return (
      this.profiles?.redact(redact(text, this.storage.config.password)) ??
      redact(text, this.storage.config.password)
    );
  }

  private async persist() {
    await atomicJson(
      path.join(this.storage.config.historyDir, 'operations.json'),
      this.operations.slice(0, 100),
    );
  }

  async current(): Promise<Snapshot> {
    if (!this.snapshot) await this.refresh();
    return { ...this.snapshot!, busy: this.busy, operations: this.operations.slice(0, 100) };
  }

  async worlds(): Promise<WorldCatalog> {
    const profiles = this.profiles?.list() || [];
    const worlds = (await this.storage.candidates()).map((world) => ({
      ...world,
      profileId: profiles.find(
        (profile) => profile.worldName.toLocaleLowerCase() === world.name.toLocaleLowerCase(),
      )?.id,
    }));
    return {
      worlds,
      profiles,
      activeProfileId: this.profiles?.activeId ?? null,
      configured: !!this.profiles?.activeId || (await this.storage.hasWorld()),
    };
  }

  async refresh() {
    if (this.polling) return;
    this.polling = true;
    try {
      const server = await this.docker.status();
      server.message = this.sanitize(server.message);
      const [logs, backups] = await Promise.all([
        server.state === 'unavailable' ? Promise.resolve([]) : this.docker.logs().catch(() => []),
        this.storage.list(),
      ]);
      if (server.state === 'ready' && this.profiles?.activeId && !this.busy) {
        const profile = this.profiles.get(this.profiles.activeId);
        if (!profile.generated) {
          this.busy = true;
          try {
            if (await this.storage.hasWorld()) await this.profiles.markStarted(profile.id);
          } finally {
            this.busy = false;
          }
        }
      }
      this.snapshot = {
        server,
        backups,
        busy: this.busy,
        logs: logs.map((line) => ({ ...line, text: this.sanitize(line.text) })),
        operations: this.operations.slice(0, 100),
      };
      this.emit('snapshot', await this.current());
    } finally {
      this.polling = false;
    }
  }

  submit(request: ActionRequest, kind: Backup['kind'] = 'manual'): Operation {
    if (this.shuttingDown) throw new AppError('O painel esta encerrando.', 503);
    if (this.busy)
      throw new AppError('Outra operacao esta em andamento. Aguarde sua conclusao.', 409);
    if (['restore', 'import', 'activate'].includes(request.action) && request.confirm !== true) {
      throw new AppError('Confirme a operacao antes de continuar.');
    }
    if (request.action === 'restore' && !request.backupId) throw new AppError('Escolha um backup.');
    if (request.action === 'import' && !request.worldId && !request.settings?.worldId)
      throw new AppError('Escolha um mundo.');
    if (['create-profile', 'update-profile', 'import'].includes(request.action) && this.profiles) {
      if (!request.settings) throw new AppError('Preencha as configuracoes do mundo.');
      this.profiles.validate(
        request.settings,
        request.action === 'update-profile' ? request.profileId : undefined,
      );
    }
    if (['activate', 'update-profile'].includes(request.action)) {
      if (!request.profileId || !this.profiles) throw new AppError('Escolha um perfil.');
      this.profiles.get(request.profileId);
    }
    if (request.action === 'create-profile' && !request.settings?.worldName)
      throw new AppError('Informe o nome do mundo.');
    this.busy = true;
    const operation: Operation = {
      id: randomUUID(),
      action: request.action,
      profileId: request.profileId ?? this.profiles?.activeId ?? this.storage.config.profileId,
      status: 'running',
      message: 'Preparando operacao...',
      startedAt: new Date().toISOString(),
    };
    this.operations.unshift(operation);
    this.emit('operation', operation);
    this.active = this.execute(request, operation, kind);
    return operation;
  }

  async waitForIdle() {
    await this.active;
  }

  private async progress(operation: Operation, message: string) {
    operation.message = this.sanitize(message);
    await this.persist();
    this.emit('operation', operation);
  }

  private async quiesce(operation: Operation) {
    const before = await this.docker.inspect();
    const running = before?.State.Running === true;
    if (running) {
      await this.progress(operation, 'Salvando e encerrando o servidor com seguranca...');
      await this.docker.stop();
    }
    const after = await this.docker.inspect();
    if (after?.State.Running)
      throw new AppError('O servidor ainda esta ativo. Operacao recusada.', 409);
    if (after?.State.OOMKilled || after?.State.ExitCode === 137) {
      throw new AppError(
        'Ultimo encerramento foi forcado. Confira os saves antes de continuar.',
        409,
      );
    }
    return running;
  }

  private async startActive(operation: Operation) {
    if (this.profiles) {
      if (!this.profiles.activeId) throw new AppError('Ative um mundo antes de iniciar.');
      await this.profiles.ensureStartable(this.profiles.activeId);
    } else if (!(await this.storage.hasWorld())) {
      throw new AppError('Importe seu mundo antes de iniciar.');
    }
    await this.progress(operation, 'Iniciando container. Aguarde o estado Pronto para jogar.');
    await this.docker.start();
    if (this.profiles?.activeId) await this.profiles.markStarted(this.profiles.activeId);
    await this.progress(
      operation,
      'Container iniciado. O painel indicara quando o jogo estiver disponivel.',
    );
  }

  private async createProfile(request: ActionRequest, operation: Operation) {
    const settings = request.settings!;
    let name = settings.worldName!;
    const importing = request.action === 'import';
    if (importing) {
      const candidate = (await this.storage.candidates()).find(
        (world) => world.id === settings.worldId,
      );
      if (!candidate?.available) throw new AppError('Mundo nao encontrado ou incompleto.');
      name = candidate.name;
    }
    await this.progress(
      operation,
      importing
        ? 'Copiando e verificando o mundo local...'
        : 'Criando perfil. O mundo sera gerado no primeiro inicio.',
    );
    const profile = await this.profiles!.create(settings, importing ? 'local' : 'new', name);
    operation.profileId = profile.id;
    if (!this.profiles!.activeId) {
      await this.profiles!.activate(profile.id);
      await this.storage.init();
    }
    await this.progress(operation, 'Perfil salvo. Suas configuracoes serao lembradas pelo Socius.');
  }

  private async activateProfile(request: ActionRequest, operation: Operation) {
    const id = request.profileId!;
    if (this.profiles!.activeId === id) {
      await this.progress(operation, 'Este mundo ja esta ativo.');
      return;
    }
    await this.profiles!.ensureStartable(id);
    const resume = await this.quiesce(operation);
    if (this.profiles!.activeId && (await this.storage.hasWorld())) {
      await this.progress(operation, 'Criando backup do mundo atual antes da troca...');
      await this.storage.create('manual');
    }
    await this.profiles!.activate(id);
    await this.storage.init();
    if (resume) await this.startActive(operation);
    await this.progress(
      operation,
      resume
        ? 'Mundo trocado. Aguarde a disponibilidade do servidor.'
        : 'Mundo ativo. O servidor permanece desligado.',
    );
  }

  private async updateProfile(request: ActionRequest, operation: Operation) {
    const id = request.profileId!;
    const active = this.profiles!.activeId === id;
    const running = active && (await this.docker.inspect())?.State.Running === true;
    if (running && !request.confirm)
      throw new AppError('Confirme o backup e reinicio para salvar as alteracoes.', 409);
    if (running) {
      await this.quiesce(operation);
      await this.progress(operation, 'Criando backup antes de alterar as configuracoes...');
      await this.storage.create('manual');
    }
    await this.profiles!.update(id, request.settings!);
    if (running) await this.startActive(operation);
    await this.progress(operation, 'Configuracoes salvas.');
  }

  private async backupOrRestore(
    request: ActionRequest,
    operation: Operation,
    kind: Backup['kind'],
  ) {
    if (request.action === 'restore') await this.storage.verify(request.backupId!);
    const resume = await this.quiesce(operation);
    if (request.action === 'backup') {
      await this.progress(operation, 'Copiando e verificando a integridade do backup...');
      await this.storage.create(kind);
    } else {
      await this.progress(operation, 'Criando copia de recuperacao antes da restauracao...');
      const recovery = await this.storage.create('recovery');
      operation.recoveryId = recovery.id;
      await this.persist();
      await this.progress(operation, 'Restaurando o backup verificado...');
      await this.storage.restore(request.backupId!);
    }
    if (resume) await this.startActive(operation);
    await this.progress(
      operation,
      request.action === 'backup'
        ? 'Backup criado e verificado.'
        : 'Restauracao concluida. Confira o progresso dentro do jogo.',
    );
  }

  private async execute(request: ActionRequest, operation: Operation, kind: Backup['kind']) {
    try {
      await this.persist();
      switch (request.action) {
        case 'start':
        case 'restart':
          if (this.profiles?.activeId) await this.profiles.ensureStartable(this.profiles.activeId);
          if (request.action === 'restart') await this.docker.stop();
          await this.startActive(operation);
          break;
        case 'stop':
          await this.progress(operation, 'Salvando e encerrando o servidor...');
          await this.docker.stop();
          await this.progress(operation, 'Servidor desligado.');
          break;
        case 'create-profile':
          await this.createProfile(request, operation);
          break;
        case 'import':
          if (this.profiles) await this.createProfile(request, operation);
          else {
            if ((await this.docker.inspect())?.State.Running)
              throw new AppError('Pare o servidor antes de importar.', 409);
            await this.storage.importWorld(request.worldId!);
          }
          break;
        case 'activate':
          await this.activateProfile(request, operation);
          break;
        case 'update-profile':
          await this.updateProfile(request, operation);
          break;
        case 'backup':
        case 'restore':
          if (request.profileId && request.profileId !== this.storage.config.profileId)
            throw new AppError('Ative este mundo antes de administrar seus backups.');
          await this.backupOrRestore(request, operation, kind);
          break;
      }
      operation.status = 'succeeded';
    } catch (error) {
      operation.status = 'failed';
      operation.message = this.sanitize(error instanceof Error ? error.message : String(error));
      if (['backup', 'restore', 'activate', 'update-profile'].includes(request.action)) {
        operation.message +=
          ' Em caso de falha apos a parada, o servidor permanece desligado. Confira os dados antes de iniciar.';
      }
    } finally {
      operation.finishedAt = new Date().toISOString();
      try {
        await this.persist();
      } catch {
        operation.status = 'failed';
        operation.message += ' Nao foi possivel persistir o historico.';
      }
      this.busy = false;
      this.emit('operation', operation);
      await this.refresh().catch((error) => this.emit('diagnostic', this.sanitize(String(error))));
    }
  }

  async dailyTick(date = new Date()) {
    if (this.busy || this.shuttingDown || !(await this.storage.hasWorld())) return;
    const format = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Sao_Paulo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      hourCycle: 'h23',
    });
    const parts = format.formatToParts(date);
    const get = (key: string) => parts.find((part) => part.type === key)!.value;
    const day = `${get('year')}-${get('month')}-${get('day')}`;
    if (Number(get('hour')) < this.storage.config.backupHour) return;
    const forActive = this.operations.filter(
      (operation) =>
        operation.action === 'backup' &&
        (operation.profileId ?? null) === this.storage.config.profileId,
    );
    const dateFormat = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Sao_Paulo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    if (
      forActive.some(
        (operation) =>
          operation.status === 'succeeded' &&
          dateFormat.format(new Date(operation.finishedAt!)) === day,
      )
    )
      return;
    if (
      forActive.some(
        (operation) =>
          operation.status === 'failed' &&
          date.getTime() - Date.parse(operation.startedAt) < 3_600_000,
      )
    )
      return;
    this.submit({ action: 'backup' }, 'daily');
  }

  async shutdown() {
    this.shuttingDown = true;
    await this.waitForIdle();
  }
}
