import type {
  Actor,
  Assignment,
  Change,
  CommandSuccess,
  EventEnvelope,
  InternalId,
  Project,
  Role,
  TransitionRecord,
  TypedReference
} from "@cimiloop/protocol";

export interface ProposedEvent {
  event_id: InternalId;
  event_type: string;
  project_id: InternalId;
  aggregate: TypedReference;
  aggregate_revision: number;
  occurred_at: string;
  actor_id: InternalId;
  command_id: InternalId;
  correlation_id: InternalId;
  payload: Record<string, unknown>;
}

export interface CommandReceipt {
  command_id: InternalId;
  request_digest: string;
  result: CommandSuccess;
  created_at: string;
}

export interface OutboxMessage {
  id: InternalId;
  project_id: InternalId;
  event_id: InternalId;
  status: "pending" | "processing" | "delivered";
  attempt_count: number;
  available_at: string;
  lease_until?: string;
  created_at: string;
  delivered_at?: string;
}

export interface StoreTransaction {
  getCommandReceipt(commandId: InternalId): CommandReceipt | undefined;
  saveCommandReceipt(receipt: CommandReceipt): void;

  getCurrentProject(): Project | undefined;
  getProject(projectId: InternalId): Project | undefined;
  insertProject(project: Project): void;
  insertActor(actor: Actor): void;
  insertRole(role: Role): void;
  insertAssignment(assignment: Assignment): void;

  getChange(idOrKey: string): Change | undefined;
  nextChangeDisplayKey(projectId: InternalId): string;
  insertChange(change: Change): void;
  updateChange(change: Change, expectedRevision: number): void;
  insertTransition(record: TransitionRecord): void;

  appendEvent(event: ProposedEvent): EventEnvelope;
  enqueueOutbox(message: OutboxMessage): void;
}

export interface ProjectStore {
  transaction<T>(work: (transaction: StoreTransaction) => T): T;
  getProject(): Project | undefined;
  getChange(idOrKey: string): Change | undefined;
  listChanges(): Change[];
  listEvents(): EventEnvelope[];
  listOutbox(status?: OutboxMessage["status"]): OutboxMessage[];
  claimOutbox(now: string, leaseUntil: string): OutboxMessage | undefined;
  markOutboxDelivered(messageId: InternalId, deliveredAt: string): void;
  releaseOutbox(messageId: InternalId, availableAt: string): void;
  close(): void;
}

export interface RegistryProject {
  project_id: InternalId;
  repository_path: string;
  database_path: string;
  last_opened_at: string;
}

export interface ProjectRegistry {
  register(project: RegistryProject): void;
  findByRepository(repositoryPath: string): RegistryProject | undefined;
  list(): RegistryProject[];
  close(): void;
}

export class StoreConflictError extends Error {
  constructor(
    message: string,
    readonly currentRevision?: number
  ) {
    super(message);
    this.name = "StoreConflictError";
  }
}
