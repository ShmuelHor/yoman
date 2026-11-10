import { Profile, type ProfileInput } from '@yoman/shared/focus';
import { z } from 'zod';

import { type Queryable, selectRow, selectRows, toPgText } from './sql.js';

/** `count(*)` is a bigint, which pg returns as a string. */
const CountRow = z.object({ count: z.coerce.number().int().min(0) });
const IdRow = z.object({ id: z.string() });

const COLUMNS = 'id, name, muted_apps AS "mutedApps", exceptions, mute_new_apps AS "muteNewApps"';
const ORDER = 'ORDER BY created_at, id';

function profileValues(input: ProfileInput): unknown[] {
  return [toPgText(input.name), input.mutedApps, input.exceptions, input.muteNewApps];
}

export function listProfiles(db: Queryable, limit: number): Promise<Profile[]> {
  return selectRows(db, Profile, `SELECT ${COLUMNS} FROM profiles ${ORDER} LIMIT $1`, [limit]);
}

export async function countProfiles(db: Queryable): Promise<number> {
  const row = await selectRow(db, CountRow, 'SELECT count(*) AS count FROM profiles');
  return row?.count ?? 0;
}

export function getProfile(db: Queryable, id: string): Promise<Profile | null> {
  return selectRow(db, Profile, `SELECT ${COLUMNS} FROM profiles WHERE id = $1`, [id]);
}

/** The oldest profile: a fresh install's seeded one until the user deletes it. */
export function defaultProfile(db: Queryable): Promise<Profile | null> {
  return selectRow(db, Profile, `SELECT ${COLUMNS} FROM profiles ${ORDER} LIMIT 1`);
}

export async function createProfile(db: Queryable, input: ProfileInput): Promise<Profile> {
  const profile = await selectRow(
    db,
    Profile,
    `INSERT INTO profiles (name, muted_apps, exceptions, mute_new_apps)
     VALUES ($1, $2, $3, $4) RETURNING ${COLUMNS}`,
    profileValues(input),
  );
  if (profile === null) {
    throw new Error('INSERT returned no row');
  }
  return profile;
}

export function updateProfile(
  db: Queryable,
  id: string,
  input: ProfileInput,
): Promise<Profile | null> {
  return selectRow(
    db,
    Profile,
    `UPDATE profiles SET name = $2, muted_apps = $3, exceptions = $4, mute_new_apps = $5
     WHERE id = $1 RETURNING ${COLUMNS}`,
    [id, ...profileValues(input)],
  );
}

export async function deleteProfile(db: Queryable, id: string): Promise<boolean> {
  const row = await selectRow(db, IdRow, 'DELETE FROM profiles WHERE id = $1 RETURNING id', [id]);
  return row !== null;
}
