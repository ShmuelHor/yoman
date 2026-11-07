import { z } from 'zod';

/** Bytes of randomness behind every generated secret (SECURITY A5: a 32-byte `AGENT_TOKEN`). */
export const SECRET_BYTES = 32;

/** How a secret's value is checked when it already exists in `.env`. */
type SecretFormat = 'password' | 'token';

interface SecretSpec {
  readonly key: string;
  readonly format: SecretFormat;
  readonly description: string;
}

/** Services that each get their own Postgres role, and so their own password (SPEC, SECURITY). */
const SERVICE_ROLES = [
  'sessions',
  'reports',
  'goals',
  'battery',
  'system',
  'focus',
  'gateway',
] as const;

/**
 * Every secret `.env` must hold, in the order they are written.
 * `.env.example` lists the same keys with placeholders; a test keeps the two in sync.
 */
export const SECRETS: readonly SecretSpec[] = [
  {
    key: 'POSTGRES_PASSWORD',
    format: 'password',
    description: 'Postgres superuser, used only by the init script',
  },
  ...SERVICE_ROLES.map(
    (role): SecretSpec => ({
      key: `${role.toUpperCase()}_DB_PASSWORD`,
      format: 'password',
      description: `Postgres role of the ${role} service`,
    }),
  ),
  {
    key: 'AGENT_TOKEN',
    format: 'token',
    description: 'Bearer token the agent sends to the gateway',
  },
];

/** Generated values are base64url of {@link SECRET_BYTES} bytes: 43 characters, no padding. */
const BASE64URL_LENGTH = 43;
const HEX_LENGTH = SECRET_BYTES * 2;
const MAX_VALUE_LENGTH = 256;
/** A hand-chosen password must carry at least as many characters as a 32-byte secret has bytes. */
const MIN_PASSWORD_LENGTH = 32;
const MAX_KEY_LENGTH = 128;

/**
 * A password chosen by hand is accepted if it is long and URL-safe, since it ends
 * up in connection strings and the Postgres init script.
 */
const Password = z
  .string()
  .regex(/^[A-Za-z0-9_-]+$/u, 'must contain only A-Z, a-z, 0-9, "_" and "-"')
  .min(MIN_PASSWORD_LENGTH)
  .max(MAX_VALUE_LENGTH);

/** `AGENT_TOKEN` is exactly 32 bytes, as base64url (what setup writes) or hex. */
const Token = z.union(
  [
    z.string().regex(new RegExp(`^[A-Za-z0-9_-]{${String(BASE64URL_LENGTH)}}$`, 'u')),
    z.string().regex(new RegExp(`^[0-9a-f]{${String(HEX_LENGTH)}}$`, 'iu')),
  ],
  { error: 'must be 32 bytes as base64url (43 characters) or hex (64 characters)' },
);

const SECRET_SCHEMAS: Readonly<Record<SecretFormat, z.ZodType<string>>> = {
  password: Password,
  token: Token,
};

/** One `KEY=VALUE` line of a `.env` file. */
export const EnvEntry = z
  .object({
    key: z
      .string()
      .max(MAX_KEY_LENGTH)
      .regex(/^[A-Z][A-Z0-9_]*$/u, 'must be upper case letters, digits and "_"'),
    value: z.string().max(MAX_VALUE_LENGTH),
  })
  .strict();
export type EnvEntry = z.infer<typeof EnvEntry>;

/** Thrown when an existing `.env` cannot be trusted, so setup must not touch it. */
export class InvalidEnvFileError extends Error {
  readonly code = 'INVALID_ENV_FILE';

  constructor(readonly problems: readonly string[]) {
    super(`.env is invalid:\n${problems.map((problem) => `  ${problem}`).join('\n')}`);
    this.name = 'InvalidEnvFileError';
  }
}

const LINE_PATTERN = /^([^=\s]+)=(.*)$/u;

function isIgnorable(line: string): boolean {
  const trimmed = line.trim();
  return trimmed.length === 0 || trimmed.startsWith('#');
}

/**
 * Parses `.env` content into entries. Only plain `KEY=VALUE` lines, blank lines
 * and `#` comments are allowed. Anything else fails, because setup would
 * otherwise guess at what the line means.
 *
 * Problems name the line and key but never the value, which may be a secret.
 */
export function parseEnv(content: string): EnvEntry[] {
  const entries: EnvEntry[] = [];
  const problems: string[] = [];
  const seen = new Set<string>();

  content.split(/\r?\n/u).forEach((line, index) => {
    if (isIgnorable(line)) {
      return;
    }
    const lineNumber = index + 1;
    const match = LINE_PATTERN.exec(line);
    const parsed = EnvEntry.safeParse({ key: match?.[1], value: match?.[2] });
    if (match === null || !parsed.success) {
      problems.push(`line ${String(lineNumber)}: expected KEY=VALUE with an upper case key`);
      return;
    }
    if (seen.has(parsed.data.key)) {
      problems.push(`line ${String(lineNumber)}: ${parsed.data.key} is defined twice`);
      return;
    }
    seen.add(parsed.data.key);
    entries.push(parsed.data);
  });

  if (problems.length > 0) {
    throw new InvalidEnvFileError(problems);
  }
  return entries;
}

/** Checks the secrets that are present. Missing ones are fine: setup adds them. */
function validateSecrets(entries: readonly EnvEntry[]): void {
  const values = new Map(entries.map(({ key, value }) => [key, value]));
  const problems = SECRETS.flatMap(({ key, format }) => {
    const value = values.get(key);
    if (value === undefined) {
      return [];
    }
    const result = SECRET_SCHEMAS[format].safeParse(value);
    return result.success
      ? []
      : [`${key} ${result.error.issues.map((issue) => issue.message).join('; ')}`];
  });
  if (problems.length > 0) {
    throw new InvalidEnvFileError(problems);
  }
}

/** Produces a fresh secret value. Injected so tests are deterministic. */
export type SecretGenerator = () => string;

/** The result of planning `.env`: the content to write and the keys that were added. */
export interface EnvPlan {
  readonly content: string;
  readonly added: readonly string[];
}

/**
 * Plans the new `.env` content. Existing lines are kept byte for byte; only
 * missing secrets are appended. With nothing missing, the content is returned
 * unchanged and `added` is empty, so a re-run writes nothing.
 *
 * @param existing current `.env` content, or `undefined` when there is no file
 * @throws InvalidEnvFileError when the existing file is malformed or a secret is invalid
 */
export function planEnv(existing: string | undefined, generate: SecretGenerator): EnvPlan {
  const current = existing ?? '';
  const entries = parseEnv(current);
  validateSecrets(entries);

  const present = new Set(entries.map(({ key }) => key));
  const missing = SECRETS.filter(({ key }) => !present.has(key));
  if (missing.length === 0) {
    return { content: current, added: [] };
  }

  const header = existing === undefined ? '# Generated by `npm run setup`. Never commit.\n' : '';
  const separator = current.length === 0 || current.endsWith('\n') ? '' : '\n';
  const lines = missing.map(({ key, description }) => `# ${description}\n${key}=${generate()}\n`);
  return {
    content: `${header}${current}${separator}${lines.join('')}`,
    added: missing.map(({ key }) => key),
  };
}
