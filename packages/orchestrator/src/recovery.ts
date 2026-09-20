import type { InternalId } from "@cimiloop/protocol";

export class MemoryProcessRegistry {
  readonly #entries = new Map<InternalId, { reference: string; running: boolean }>();

  remember(runId: InternalId, processReference: string, running: boolean): void {
    this.#entries.set(runId, { reference: processReference, running });
  }

  reference(runId: InternalId): string | undefined {
    return this.#entries.get(runId)?.reference;
  }

  isRunning(runId: InternalId): boolean {
    return this.#entries.get(runId)?.running ?? false;
  }
}
