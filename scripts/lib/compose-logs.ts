import { prettyFactory } from 'pino-pretty';

/** The containers `docker compose logs` can show (README Logs section). */
export const LOG_SERVICES = [
  'gateway',
  'sessions',
  'reports',
  'goals',
  'battery',
  'system',
  'focus',
  'web',
  'postgres',
] as const;
export type LogService = (typeof LOG_SERVICES)[number];

const SERVICE_COLUMN_WIDTH = Math.max(...LOG_SERVICES.map((name) => name.length));

/** `gateway-1  | {...}`: the prefix Compose puts in front of every line. */
const COMPOSE_PREFIX = /^([a-z][a-z0-9_-]*?)-\d+\s+\| (.*)$/;

export class UnknownServiceError extends Error {
  override readonly name = 'UnknownServiceError';

  constructor(readonly requested: string) {
    super(`Unknown service. Choose one of: ${LOG_SERVICES.join(', ')}.`);
  }
}

/** Only a known service name reaches the `docker compose` command line. */
export function parseServices(args: readonly string[]): LogService[] {
  return args.map((arg) => {
    const service = LOG_SERVICES.find((name) => name === arg);
    if (service === undefined) {
      throw new UnknownServiceError(arg);
    }
    return service;
  });
}

const PRETTY_OPTIONS = {
  singleLine: true,
  translateTime: 'SYS:HH:MM:ss.l',
  ignore: 'pid,hostname',
} as const;

export type Prettify = (json: string) => string;

export function createPrettify(colorize = true): Prettify {
  const pretty = prettyFactory({ ...PRETTY_OPTIONS, colorize });
  return (json) => pretty(json).trimEnd();
}

function isJsonObject(text: string): boolean {
  return text.startsWith('{') && text.endsWith('}');
}

/**
 * Turns one line of `docker compose logs` into a readable one, keeping the
 * service as a column. JSON lines (`LOG_FORMAT=json`) are pretty-printed; nginx
 * and Postgres lines, and lines already pretty, pass through unchanged.
 */
export function formatComposeLine(line: string, prettify: Prettify): string {
  const match = COMPOSE_PREFIX.exec(line);
  if (match === null) {
    return line;
  }
  const [, service = '', text = ''] = match;
  const body = isJsonObject(text) ? prettify(text) : text;
  return `${service.padEnd(SERVICE_COLUMN_WIDTH)} | ${body}`;
}
