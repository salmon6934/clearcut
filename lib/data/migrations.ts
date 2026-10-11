// lib/data/migrations.ts
// Forward-only Local Schema Migration Engine for Namespaced Storage

import type { StorageAdapter } from './storage-adapter';

export const CURRENT_SCHEMA_VERSION = 1;

export interface MigrationStep {
  version: number;
  description: string;
  up: (adapter: StorageAdapter) => void;
}

/**
 * Built-in schema migrations.
 * Each migration must be forward-only and idempotent where possible.
 */
export const CORE_MIGRATIONS: MigrationStep[] = [
  {
    version: 1,
    description: 'v1: Initialize store structure and indexes',
    up: (adapter: StorageAdapter) => {
      // Ensure collections exist if not present
      if (!adapter.getItem('groups')) {
        adapter.setItem('groups', JSON.stringify({}));
      }
      if (!adapter.getItem('members')) {
        adapter.setItem('members', JSON.stringify({}));
      }
      if (!adapter.getItem('expenses')) {
        adapter.setItem('expenses', JSON.stringify({}));
      }
      if (!adapter.getItem('settlements')) {
        adapter.setItem('settlements', JSON.stringify({}));
      }
      if (!adapter.getItem('mutation_queue')) {
        adapter.setItem('mutation_queue', JSON.stringify([]));
      }
    },
  },
];

/**
 * Gets current schema version stored in the adapter. Defaults to 0.
 */
export function getSchemaVersion(adapter: StorageAdapter): number {
  const raw = adapter.getItem('meta.schemaVersion');
  if (!raw) return 0;
  const parsed = parseInt(raw, 10);
  return isNaN(parsed) ? 0 : parsed;
}

/**
 * Runs pending migrations sequentially up to targetVersion (or latest available).
 * Executes synchronously before any application reads/writes.
 */
export function runMigrations(
  adapter: StorageAdapter,
  steps: MigrationStep[] = CORE_MIGRATIONS,
  targetVersion: number = CURRENT_SCHEMA_VERSION
): number {
  const currentVersion = getSchemaVersion(adapter);
  if (currentVersion >= targetVersion) {
    return currentVersion;
  }

  // Sort migrations in ascending order
  const sorted = [...steps].sort((a, b) => a.version - b.version);

  let appliedVersion = currentVersion;
  for (const step of sorted) {
    if (step.version > appliedVersion && step.version <= targetVersion) {
      try {
        step.up(adapter);
        appliedVersion = step.version;
        adapter.setItem('meta.schemaVersion', String(appliedVersion));
      } catch (err) {
        console.error(`[Migrations] Migration failed at version ${step.version} (${step.description}):`, err);
        throw err;
      }
    }
  }

  return appliedVersion;
}
