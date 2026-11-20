import type {
  ComponentKey,
  ComponentMap,
  Entity,
  EntityId,
  EntityWith,
} from './components';

/**
 * Uniform contract implemented by all ECS simulation systems.
 */
export interface ISystem {
  update(dt: number, elapsed: number): void;
}

type EntityRemovedListener = (entity: Entity) => void;

interface CachedQueryBucket {
  readonly keys: readonly ComponentKey[];
  readonly entities: Entity[];
  readonly indexById: Map<EntityId, number>;
}

/**
 * Lightweight, strongly-typed Object ECS world with incrementally maintained
 * archetype query caches. Zero per-frame full-world scan allocations.
 */
export class ECSWorld {
  private nextEntityId: EntityId = 1;
  private readonly entities = new Map<EntityId, Entity>();
  private readonly queryCache = new Map<string, CachedQueryBucket>();
  private readonly removedListeners = new Set<EntityRemovedListener>();

  /**
   * Creates a new entity with the supplied initial traits and indexes it into
   * all active archetype query caches.
   */
  public createEntity<T extends Partial<ComponentMap>>(
    components?: T,
  ): Entity & T {
    const id = this.nextEntityId++;
    const entity = Object.assign({ id }, components) as Entity & T;
    this.entities.set(id, entity);
    this.indexEntityIntoQueries(entity);
    return entity;
  }

  /**
   * Destroys an entity by ID, evicts it from all cached queries, and notifies
   * disposal listeners (e.g. RenderSyncSystem removing its Three.js Object3D).
   */
  public destroyEntity(id: EntityId): boolean {
    const entity = this.entities.get(id);
    if (!entity) return false;

    this.entities.delete(id);
    this.evictEntityFromQueries(id);

    this.removedListeners.forEach((listener) => {
      listener(entity);
    });

    return true;
  }

  public getEntity(id: EntityId): Entity | undefined {
    return this.entities.get(id);
  }

  public hasEntity(id: EntityId): boolean {
    return this.entities.has(id);
  }

  public getEntityCount(): number {
    return this.entities.size;
  }

  /**
   * Attaches or replaces a component on an existing entity and synchronizes
   * matching cached archetype queries.
   */
  public addComponent<K extends ComponentKey>(
    entityOrId: Entity | EntityId,
    key: K,
    value: ComponentMap[K],
  ): void {
    const entity =
      typeof entityOrId === 'number'
        ? this.entities.get(entityOrId)
        : entityOrId;
    if (!entity || !this.entities.has(entity.id)) return;

    (entity as Partial<ComponentMap>)[key] = value;
    this.syncEntityMembership(entity);
  }

  /**
   * Removes a component trait from an entity and updates cached archetype queries.
   */
  public removeComponent<K extends ComponentKey>(
    entityOrId: Entity | EntityId,
    key: K,
  ): void {
    const entity =
      typeof entityOrId === 'number'
        ? this.entities.get(entityOrId)
        : entityOrId;
    if (!entity || !this.entities.has(entity.id)) return;

    delete (entity as Partial<ComponentMap>)[key];
    this.syncEntityMembership(entity);
  }

  /**
   * Returns a cached, incrementally updated list of all entities carrying every
   * requested component trait.
   */
  public query<K extends ComponentKey>(
    ...keys: K[]
  ): readonly EntityWith<K>[] {
    const signature = this.getSignature(keys);
    let bucket = this.queryCache.get(signature);

    if (!bucket) {
      const uniqueKeys = Array.from(new Set(keys));
      bucket = {
        keys: uniqueKeys,
        entities: [],
        indexById: new Map<EntityId, number>(),
      };

      this.entities.forEach((entity) => {
        if (this.matchesKeys(entity, uniqueKeys)) {
          bucket!.indexById.set(entity.id, bucket!.entities.length);
          bucket!.entities.push(entity);
        }
      });

      this.queryCache.set(signature, bucket);
    }

    return bucket.entities as unknown as readonly EntityWith<K>[];
  }

  /**
   * Convenience helper for singleton or unique-archetype queries (e.g., player or active boss).
   */
  public queryFirst<K extends ComponentKey>(
    ...keys: K[]
  ): EntityWith<K> | undefined {
    const results = this.query(...keys);
    return results[0];
  }

  /**
   * Subscribes to entity destruction events for external resource cleanup.
   * Returns an unsubscribe callback.
   */
  public onEntityRemoved(listener: EntityRemovedListener): () => void {
    this.removedListeners.add(listener);
    return () => {
      this.removedListeners.delete(listener);
    };
  }

  /**
   * Destroys all entities cleanly (firing removal listeners) and clears caches.
   */
  public clear(): void {
    const ids = Array.from(this.entities.keys());
    for (let i = 0; i < ids.length; i++) {
      const id = ids[i];
      if (id !== undefined) {
        this.destroyEntity(id);
      }
    }
    this.queryCache.clear();
  }

  private getSignature(keys: readonly ComponentKey[]): string {
    if (keys.length === 1) return keys[0] ?? '';
    return Array.from(new Set(keys)).sort().join('|');
  }

  private matchesKeys(
    entity: Entity,
    keys: readonly ComponentKey[],
  ): boolean {
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i];
      if (key !== undefined && entity[key] === undefined) {
        return false;
      }
    }
    return true;
  }

  private indexEntityIntoQueries(entity: Entity): void {
    this.queryCache.forEach((bucket) => {
      if (
        !bucket.indexById.has(entity.id) &&
        this.matchesKeys(entity, bucket.keys)
      ) {
        bucket.indexById.set(entity.id, bucket.entities.length);
        bucket.entities.push(entity);
      }
    });
  }

  private syncEntityMembership(entity: Entity): void {
    this.queryCache.forEach((bucket) => {
      const isIndexed = bucket.indexById.has(entity.id);
      const shouldBeIndexed = this.matchesKeys(entity, bucket.keys);

      if (shouldBeIndexed && !isIndexed) {
        bucket.indexById.set(entity.id, bucket.entities.length);
        bucket.entities.push(entity);
      } else if (!shouldBeIndexed && isIndexed) {
        this.removeFromBucket(bucket, entity.id);
      }
    });
  }

  private evictEntityFromQueries(id: EntityId): void {
    this.queryCache.forEach((bucket) => {
      if (bucket.indexById.has(id)) {
        this.removeFromBucket(bucket, id);
      }
    });
  }

  private removeFromBucket(bucket: CachedQueryBucket, id: EntityId): void {
    const idx = bucket.indexById.get(id);
    if (idx === undefined) return;

    const lastIdx = bucket.entities.length - 1;
    const lastEntity = bucket.entities[lastIdx];

    if (idx !== lastIdx && lastEntity !== undefined) {
      bucket.entities[idx] = lastEntity;
      bucket.indexById.set(lastEntity.id, idx);
    }

    bucket.entities.pop();
    bucket.indexById.delete(id);
  }
}
