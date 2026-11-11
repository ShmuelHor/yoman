import type { ServiceName } from '@yoman/shared/common';
import { z } from 'zod';

const MAX_PORT = 65_535;
const DEFAULT_PORT = 8080;
/** `npm run setup` writes 43 base64url characters (32 bytes); a shorter token is a mistake. */
const MIN_TOKEN_LENGTH = 32;
const MAX_TOKEN_LENGTH = 256;
const MAX_URL_LENGTH = 256;

/** Where a service listens on the internal `core` network (SPEC §3), `http://<name>:8080` by default. */
const serviceUrl = (service: ServiceName): z.ZodType<URL, string | undefined> =>
  z
    .url({ protocol: /^http$/ })
    .max(MAX_URL_LENGTH)
    .default(`http://${service}:${DEFAULT_PORT}`)
    .transform((value) => new URL(value));

const GatewayEnvironment = z.object({
  HOST: z.string().min(1).default('127.0.0.1'),
  PORT: z.coerce.number().int().min(1).max(MAX_PORT).default(DEFAULT_PORT),
  // Anything but an explicit `development` runs as production: fail closed.
  NODE_ENV: z.enum(['development', 'production', 'test']).default('production'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  // Unset means pretty in development and JSON everywhere else.
  LOG_FORMAT: z.enum(['pretty', 'json']).optional(),
  AGENT_TOKEN: z
    .string()
    .min(MIN_TOKEN_LENGTH)
    .max(MAX_TOKEN_LENGTH)
    .regex(/^[A-Za-z0-9_-]+$/),
  SESSIONS_URL: serviceUrl('sessions'),
  REPORTS_URL: serviceUrl('reports'),
  GOALS_URL: serviceUrl('goals'),
  BATTERY_URL: serviceUrl('battery'),
  SYSTEM_URL: serviceUrl('system'),
  FOCUS_URL: serviceUrl('focus'),
});

export type LogFormat = 'pretty' | 'json';
export type LogLevel = z.output<typeof GatewayEnvironment>['LOG_LEVEL'];

export interface GatewayConfig {
  readonly host: string;
  readonly port: number;
  readonly logLevel: LogLevel;
  /** `NODE_ENV=development`: API docs. Never set in the image. */
  readonly development: boolean;
  /** `LOG_FORMAT`: one readable line per entry, or JSON for filtering and `pino-pretty`. */
  readonly logFormat: LogFormat;
  readonly agentToken: string;
  readonly serviceUrls: Readonly<Record<ServiceName, URL>>;
}

export type Environment = Readonly<Record<string, string | undefined>>;

/**
 * Validates the environment. A failure names the variables, never their
 * values, so `AGENT_TOKEN` cannot end up in a crash log.
 */
export function loadConfig(env: Environment): GatewayConfig {
  const result = GatewayEnvironment.safeParse(env);
  if (!result.success) {
    const names = [...new Set(result.error.issues.map((issue) => issue.path.join('.')))];
    throw new Error(`Invalid environment configuration: ${names.join(', ')}`);
  }
  const data = result.data;
  return {
    host: data.HOST,
    port: data.PORT,
    logLevel: data.LOG_LEVEL,
    development: data.NODE_ENV === 'development',
    logFormat: data.LOG_FORMAT ?? (data.NODE_ENV === 'development' ? 'pretty' : 'json'),
    agentToken: data.AGENT_TOKEN,
    serviceUrls: {
      sessions: data.SESSIONS_URL,
      reports: data.REPORTS_URL,
      goals: data.GOALS_URL,
      battery: data.BATTERY_URL,
      system: data.SYSTEM_URL,
      focus: data.FOCUS_URL,
    },
  };
}
