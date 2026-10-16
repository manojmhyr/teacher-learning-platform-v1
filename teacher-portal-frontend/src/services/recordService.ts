import { isLiveBackend } from '@/config/env';
import { portalApi } from '@/services/api/portalApi';
import type { TeachingRecord } from '@/types';
import { uid } from '@/utils/format';

/**
 * Teaching records are append-only.
 *
 * Every save creates a new record with a client-generated id, which doubles as
 * the API's idempotency key. A retry after a flaky classroom network therefore
 * cannot produce a duplicate row in a table that never updates or deletes.
 */

export function buildRecord(input: Omit<TeachingRecord, 'id' | 'createdAt'>): TeachingRecord {
  return { ...input, id: uid(), createdAt: new Date().toISOString() };
}

/** Persists a record. Falls back to local-only in demo mode. */
export async function saveRecord(record: TeachingRecord): Promise<TeachingRecord> {
  if (!isLiveBackend) {
    await new Promise((r) => setTimeout(r, 650));
    return record;
  }
  await portalApi.saveRecord(record);
  return record;
}

export interface RecordValidation {
  ok: boolean;
  errors: string[];
}

export function validateRecord(input: { topics: string[]; dateTaught: string; durationMin: number }): RecordValidation {
  const errors: string[] = [];
  if (input.topics.length === 0) errors.push('Select at least one topic that was covered.');
  if (!input.dateTaught) errors.push('Enter the date this lesson was taught.');
  else if (input.dateTaught > new Date().toISOString().slice(0, 10)) errors.push('The date taught cannot be in the future.');
  if (!Number.isFinite(input.durationMin) || input.durationMin <= 0) errors.push('Enter how long the session lasted.');
  else if (input.durationMin > 240) errors.push('Duration looks too long — enter the minutes for a single session.');
  return { ok: errors.length === 0, errors };
}
