import { z } from 'zod';

const MAX_PORT = 65_535;
const DEFAULT_PORT = 8080;
const DEFAULT_DB_PORT = 5432;

const baseSchema = z.object({
  HOST: z.string().min(1).default('127.0.0.1'),
  PORT: z.coerce.number().int().min(1).max(MAX_PORT).default(DEFAULT_PORT),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  DB_HOST: z.string().min(1).default('postgres'),
  DB_PORT: z.coerce.number().int().min(1).max(MAX_PORT).default(DEFAULT_DB_PORT),
  DB_NAME: z.string().min(1).default('yoman'),
});

export interface DatabaseConfig {
  readonly host: string;
  readonly port: number;
  readonly database: string;
  /** Each service connects as its own role and owns the schema of the same name. */
  readonly user: string;
  readonly schema: string;
  readonly password: string;
}

export interface ServiceConfig<Extra> {
  readonly host: string;
  readonly port: number;
  readonly logLevel: string;
  readonly db: DatabaseConfig;
  /** The service's own variables, validated by the schema it passed to `createService`. */
  readonly service: Extra;
}

/** `sessions` -> `SESSIONS_DB_PASSWORD` (matches `.env.example`). */
export function dbPasswordVariable(name: string): string {
  return `${name.toUpperCase()}_DB_PASSWORD`;
}

const SERVICE_NAME = /^[a-z][a-z0-9_]*$/;

/** The name becomes a role and a schema, so it is restricted to a safe identifier. */
export function assertServiceName(name: string): void {
  if (!SERVICE_NAME.test(name)) {
    throw new Error(`Invalid service name: ${JSON.stringify(name)}`);
  }
}

/** Names the variables that failed, never their values, so a secret cannot reach a crash log. */
function failure(error: z.ZodError, passwordVariable?: string): Error {
  const names = [
    ...new Set(
      error.issues.map((issue) => {
        const name = issue.path.join('.');
        return name === 'password' && passwordVariable !== undefined ? passwordVariable : name;
      }),
    ),
  ].join(', ');
  return new Error(`Invalid environment configuration: ${names}`);
}

export type Environment = Readonly<Record<string, string | undefined>>;

/** Validates the shared variables, the service's DB password and the service's own schema. */
export function loadConfig<Extra extends z.ZodObject = z.ZodObject<Record<never, never>>>(
  name: string,
  env: Environment,
  extra?: Extra,
): ServiceConfig<z.output<Extra>> {
  assertServiceName(name);
  const passwordVariable = dbPasswordVariable(name);
  const base = baseSchema
    .extend({ password: z.string().min(1) })
    .safeParse({ ...env, password: env[passwordVariable] });
  if (!base.success) {
    throw failure(base.error, passwordVariable);
  }
  const own = (extra ?? z.object({})).safeParse(env);
  if (!own.success) {
    throw failure(own.error);
  }
  const data = base.data;
  return {
    host: data.HOST,
    port: data.PORT,
    logLevel: data.LOG_LEVEL,
    db: {
      host: data.DB_HOST,
      port: data.DB_PORT,
      database: data.DB_NAME,
      user: name,
      schema: name,
      password: data.password,
    },
    service: own.data as z.output<Extra>,
  };
}
