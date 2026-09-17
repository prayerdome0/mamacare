/**
 * Data layer — the single door every screen uses to reach storage.
 *
 * It owns the actor (the signed-in identity) and passes it to the active
 * provider on every call, so no screen has to remember to authorise anything.
 * The device provider enforces the policy module directly; a hosted deployment
 * is additionally enforced by `firestore.rules`, which encodes the same
 * decisions server-side.
 */

import type { QuerySpec } from '@/types/domain';
import type {
  Actor,
  CollectionName,
  DataProvider,
  ListResult,
  NewRow,
  RowOf,
  TxHandle,
} from '@/services/data/contract';

export class DataLayer {
  constructor(
    readonly provider: DataProvider,
    private readonly actorRef: () => Actor | null,
  ) {}

  get actor(): Actor | null {
    return this.actorRef();
  }

  get kind(): 'firebase' | 'local' {
    return this.provider.kind;
  }

  get<T extends CollectionName>(name: T, id: string): Promise<RowOf<T> | null> {
    return this.provider.get(name, id, this.actor);
  }

  list<T extends CollectionName>(name: T, spec: QuerySpec = {}): Promise<ListResult<RowOf<T>>> {
    return this.provider.list(name, spec, this.actor);
  }

  /** Convenience: `list` returning just the rows. */
  async rows<T extends CollectionName>(name: T, spec: QuerySpec = {}): Promise<RowOf<T>[]> {
    return (await this.provider.list(name, spec, this.actor)).rows;
  }

  create<T extends CollectionName>(name: T, value: NewRow<T>): Promise<RowOf<T>> {
    return this.provider.create(name, value, this.actor);
  }

  update<T extends CollectionName>(name: T, id: string, patch: Partial<RowOf<T>>): Promise<RowOf<T>> {
    return this.provider.update(name, id, patch, this.actor);
  }

  remove(name: CollectionName, id: string): Promise<void> {
    return this.provider.remove(name, id, this.actor);
  }

  subscribe<T extends CollectionName>(
    name: T,
    spec: QuerySpec,
    onChange: (result: ListResult<RowOf<T>>) => void,
    onError: (error: unknown) => void,
  ): () => void {
    return this.provider.subscribe(name, spec, this.actor, onChange, onError);
  }

  transact<T>(work: (tx: TxHandle) => Promise<T>): Promise<T> {
    return this.provider.transact(work);
  }

  nextSequence(name: string, step = 1): Promise<number> {
    return this.provider.nextSequence(name, step);
  }

  putBlob(key: string, blob: Blob): Promise<void> {
    return this.provider.putBlob(key, blob);
  }

  getBlob(key: string): Promise<Blob | null> {
    return this.provider.getBlob(key);
  }

  deleteBlob(key: string): Promise<void> {
    return this.provider.deleteBlob(key);
  }

  async purgeLocalData(): Promise<void> {
    await this.provider.purgeLocalData?.();
  }
}

