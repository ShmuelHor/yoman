import type { Sample } from '@yoman/shared/ingest';
import { z } from 'zod';
import type { AgentLogger } from './logger.js';

/** What the core hands every collector and actuator. */
export interface PluginContext {
  readonly logger: AgentLogger;
}

export interface CollectorContext extends PluginContext {
  /** For event-driven collectors: buffers samples outside the polling schedule. */
  readonly emit: (samples: readonly Sample[]) => Promise<void>;
}

/**
 * A source of samples (SPEC §4.1). A polling collector sets `intervalMs` and
 * `collect`; an event-driven one (lock, app-discovery) subscribes in `start`.
 */
export interface Collector {
  readonly kind: 'collector';
  /** Equal to the collector's folder name. */
  readonly name: string;
  readonly intervalMs?: number;
  collect?(context: CollectorContext): Promise<readonly Sample[]>;
  start?(context: CollectorContext): Promise<void>;
  stop?(): Promise<void>;
}

/**
 * Something the agent does on the desktop (SPEC §4.2). The core validates
 * every input against `input` before `run` sees it, so actuators get typed
 * data even when the command came from the gateway.
 */
export interface Actuator<Input = unknown> {
  readonly kind: 'actuator';
  /** Equal to the actuator's folder name. */
  readonly name: string;
  readonly input: z.ZodType<Input>;
  run(input: Input, context: PluginContext): Promise<void>;
  start?(context: PluginContext): Promise<void>;
  stop?(): Promise<void>;
}

export type Plugin = Collector | Actuator;
export type PluginKind = Plugin['kind'];

/** Folder and plugin names: lowercase kebab-case, like the file names. */
export const PluginName = z.string().regex(/^[a-z][a-z0-9]*(-[a-z0-9]+)*$/);

const fn = z.custom<(...args: never[]) => unknown>((value) => typeof value === 'function');
const optionalFn = fn.optional();
const zodSchema = z.custom<z.ZodType>((value) => value instanceof z.ZodType);

const CollectorShape = z
  .looseObject({
    kind: z.literal('collector'),
    name: PluginName,
    intervalMs: z.int().positive().optional(),
    collect: optionalFn,
    start: optionalFn,
    stop: optionalFn,
  })
  .refine(
    (value) => (value.intervalMs === undefined) === (value.collect === undefined),
    'intervalMs and collect go together',
  )
  .refine(
    (value) => value.collect !== undefined || value.start !== undefined,
    'a collector polls or starts',
  );

const ActuatorShape = z.looseObject({
  kind: z.literal('actuator'),
  name: PluginName,
  input: zodSchema,
  run: fn,
  start: optionalFn,
  stop: optionalFn,
});

/** Checks a loaded module's export, since a folder can contain anything. */
export function validatePlugin<K extends PluginKind>(
  kind: K,
  value: unknown,
): Extract<Plugin, { kind: K }> {
  const shape = kind === 'collector' ? CollectorShape : ActuatorShape;
  const result = shape.safeParse(value);
  if (!result.success) {
    const problems = result.error.issues.map((issue) => {
      const path = issue.path.map(String).join('.');
      return path === '' ? issue.message : `${path}: ${issue.message}`;
    });
    throw new Error(`invalid ${kind}: ${problems.join('; ')}`);
  }
  // The shape is checked above; zod cannot check function signatures.
  return value as Extract<Plugin, { kind: K }>;
}
