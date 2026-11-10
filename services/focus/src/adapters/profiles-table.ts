import { parseRow, parseRows, toPgText } from '@yoman/service-kit/sql';
import { Profile, type ProfileInput } from '@yoman/shared/focus';
import type { Kysely } from 'kysely';
import { z } from 'zod';

import type { FocusDatabase } from './database.js';

type Db = Kysely<FocusDatabase>;

/** `count(*)` is a bigint, which pg returns as a string. */
const CountRow = z.object({ count: z.coerce.number().int().min(0) });
const IdRow = z.object({ id: z.string() });

const COLUMNS = [
  'id',
  'name',
  'muted_apps as mutedApps',
  'exceptions',
  'mute_new_apps as muteNewApps',
] as const;

function profileValues(input: ProfileInput): {
  name: string;
  muted_apps: string[];
  exceptions: string[];
  mute_new_apps: boolean;
} {
  return {
    name: toPgText(input.name),
    muted_apps: [...input.mutedApps],
    exceptions: [...input.exceptions],
    mute_new_apps: input.muteNewApps,
  };
}

export async function listProfiles(db: Db, limit: number): Promise<Profile[]> {
  return parseRows(
    Profile,
    await db
      .selectFrom('profiles')
      .select(COLUMNS)
      .orderBy('created_at')
      .orderBy('id')
      .limit(limit)
      .execute(),
  );
}

export async function countProfiles(db: Db): Promise<number> {
  const row = parseRow(
    CountRow,
    await db
      .selectFrom('profiles')
      .select((eb) => eb.fn.countAll().as('count'))
      .executeTakeFirst(),
  );
  return row?.count ?? 0;
}

export async function getProfile(db: Db, id: string): Promise<Profile | null> {
  return parseRow(
    Profile,
    await db.selectFrom('profiles').select(COLUMNS).where('id', '=', id).executeTakeFirst(),
  );
}

/** The oldest profile: a fresh install's seeded one until the user deletes it. */
export async function defaultProfile(db: Db): Promise<Profile | null> {
  return parseRow(
    Profile,
    await db
      .selectFrom('profiles')
      .select(COLUMNS)
      .orderBy('created_at')
      .orderBy('id')
      .limit(1)
      .executeTakeFirst(),
  );
}

export async function createProfile(db: Db, input: ProfileInput): Promise<Profile> {
  const profile = parseRow(
    Profile,
    await db
      .insertInto('profiles')
      .values(profileValues(input))
      .returning(COLUMNS)
      .executeTakeFirst(),
  );
  if (profile === null) {
    throw new Error('INSERT returned no row');
  }
  return profile;
}

export async function updateProfile(
  db: Db,
  id: string,
  input: ProfileInput,
): Promise<Profile | null> {
  return parseRow(
    Profile,
    await db
      .updateTable('profiles')
      .set(profileValues(input))
      .where('id', '=', id)
      .returning(COLUMNS)
      .executeTakeFirst(),
  );
}

export async function deleteProfile(db: Db, id: string): Promise<boolean> {
  const row = parseRow(
    IdRow,
    await db.deleteFrom('profiles').where('id', '=', id).returning('id').executeTakeFirst(),
  );
  return row !== null;
}
