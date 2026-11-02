import type {
  Change,
  ObservablePersistLocal,
  PersistMetadata,
  PersistOptionsLocal,
} from "@legendapp/state";
import { internal, setAtPath } from "@legendapp/state";
import { createMMKV, type MMKV } from "react-native-mmkv";

const symbolDefault = Symbol();
const MetadataSuffix = "__m";
const { safeParse, safeStringify } = internal;

/**
 * MMKV persistence plugin for Legend-State v2 supporting react-native-mmkv v4+.
 * In v4, react-native-mmkv uses `createMMKV()` instead of `new MMKV()`,
 * and `remove()` instead of `delete()`.
 */
export class ObservablePersistMMKVv4 implements ObservablePersistLocal {
  private data: Record<string, any> = {};
  private storages: Map<any, MMKV>;

  constructor() {
    this.storages = new Map([
      [symbolDefault, createMMKV({ id: "obsPersist" })],
    ]);
  }

  getTable<T = any>(
    table: string,
    config: PersistOptionsLocal,
    init: object,
  ): T {
    const storage = this.getStorage(config);
    if (this.data[table] === undefined) {
      try {
        const value = storage.getString(table);
        this.data[table] = value ? safeParse(value) : init;
      } catch (_a) {
        console.error("[legend-state] MMKV failed to parse", table);
      }
    }
    return this.data[table];
  }

  getMetadata(table: string, config: PersistOptionsLocal): PersistMetadata {
    return this.getTable(table + MetadataSuffix, config, {});
  }

  set(table: string, changes: Change[], config: PersistOptionsLocal): void {
    if (!this.data[table]) {
      this.data[table] = {};
    }
    for (let i = 0; i < changes.length; i++) {
      const { path, valueAtPath, pathTypes } = changes[i];
      this.data[table] = setAtPath(
        this.data[table],
        path,
        pathTypes,
        valueAtPath,
      );
    }
    this.save(table, config);
  }

  async setMetadata(
    table: string,
    metadata: PersistMetadata,
    config: PersistOptionsLocal,
  ): Promise<void> {
    return this.setValue(table + MetadataSuffix, metadata, config);
  }

  deleteTable(table: string, config: PersistOptionsLocal): void {
    const storage = this.getStorage(config);
    delete this.data[table];
    storage.remove(table);
  }

  deleteMetadata(table: string, config: PersistOptionsLocal): void {
    this.deleteTable(table + MetadataSuffix, config);
  }

  private getStorage(config: PersistOptionsLocal): MMKV {
    const mmkvConfig = (config as any)?.mmkv;
    if (mmkvConfig) {
      const key = JSON.stringify(mmkvConfig);
      let storage = this.storages.get(key);
      if (!storage) {
        storage = createMMKV(mmkvConfig);
        this.storages.set(key, storage);
      }
      return storage;
    } else {
      return this.storages.get(symbolDefault)!;
    }
  }

  private async setValue(
    table: string,
    value: any,
    config: PersistOptionsLocal,
  ): Promise<void> {
    this.data[table] = value;
    this.save(table, config);
  }

  private save(table: string, config: PersistOptionsLocal): void {
    const storage = this.getStorage(config);
    const v = this.data[table];
    if (v !== undefined) {
      try {
        storage.set(table, safeStringify(v));
      } catch (err) {
        console.error(err);
      }
    } else {
      storage.remove(table);
    }
  }
}
