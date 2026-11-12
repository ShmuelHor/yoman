import { type Settings, Settings as SettingsSchema } from '@yoman/shared/settings';
import { format, isValid, parse } from 'date-fns';
import { z } from 'zod';

const TIME_FORMAT = 'HH:mm';
const REFERENCE_DAY = new Date(0);
const LIST_SEPARATOR = /[\s,]+/u;

/** The fields a validation problem can be shown under. */
const FIELD_OF_PATH: Readonly<Record<string, string>> = {
  'privacy.excludedApps': 'excludedApps',
  'thresholds.memory': 'memory',
  'thresholds.cpu': 'cpu',
  'thresholds.io': 'io',
  systemApps: 'systemApps',
  'quietHours.start': 'quietStart',
  'quietHours.end': 'quietEnd',
};

/**
 * The settings as the form edits them: app lists are text (one ID per line or
 * comma separated), and quiet hours are a switch plus two times, because a form
 * cannot hold a discriminated union. It transforms into the contract's
 * `Settings`, and a problem is reported on the field it came from.
 */
export const SettingsForm = z
  .object({
    language: SettingsSchema.shape.language,
    theme: SettingsSchema.shape.theme,
    storeTitles: z.boolean(),
    excludedApps: z.string(),
    memory: z.number(),
    cpu: z.number(),
    io: z.number(),
    systemApps: z.string(),
    quietEnabled: z.boolean(),
    quietStart: z.string(),
    quietEnd: z.string(),
  })
  .transform((form, ctx): Settings => {
    const parsed = SettingsSchema.safeParse({
      language: form.language,
      theme: form.theme,
      privacy: { storeTitles: form.storeTitles, excludedApps: splitList(form.excludedApps) },
      thresholds: { memory: form.memory, cpu: form.cpu, io: form.io },
      systemApps: splitList(form.systemApps),
      quietHours: form.quietEnabled
        ? { enabled: true, start: form.quietStart, end: form.quietEnd }
        : { enabled: false },
    });
    if (parsed.success) {
      return parsed.data;
    }
    for (const issue of parsed.error.issues) {
      const key = issue.path.slice(0, 2).join('.');
      const field = FIELD_OF_PATH[key] ?? FIELD_OF_PATH[issue.path.slice(0, 1).join('.')];
      ctx.issues.push({
        code: 'custom',
        message: 'invalid setting',
        path: [field ?? 'root'],
        input: undefined,
      });
    }
    return z.NEVER;
  });
export type SettingsFormInput = z.input<typeof SettingsForm>;

function splitList(text: string): string[] {
  return text.split(LIST_SEPARATOR).filter((item) => item !== '');
}

const DEFAULT_QUIET_START = '22:00';
const DEFAULT_QUIET_END = '07:00';

/** The form values of the saved settings. */
export function settingsToForm(settings: Settings): SettingsFormInput {
  const { quietHours } = settings;
  return {
    language: settings.language,
    theme: settings.theme,
    storeTitles: settings.privacy.storeTitles,
    excludedApps: settings.privacy.excludedApps.join('\n'),
    memory: settings.thresholds.memory,
    cpu: settings.thresholds.cpu,
    io: settings.thresholds.io,
    systemApps: settings.systemApps.join('\n'),
    quietEnabled: quietHours.enabled,
    quietStart: quietHours.enabled ? quietHours.start : DEFAULT_QUIET_START,
    quietEnd: quietHours.enabled ? quietHours.end : DEFAULT_QUIET_END,
  };
}

/** A `HH:mm` value as the Date a time picker shows; `null` for anything else. */
export function clockToDate(clock: string): Date | null {
  const date = parse(clock, TIME_FORMAT, REFERENCE_DAY);
  return isValid(date) ? date : null;
}

/** What a time picker reports as a `HH:mm` value; empty while the input is incomplete. */
export function dateToClock(date: Date | null): string {
  return date !== null && isValid(date) ? format(date, TIME_FORMAT) : '';
}
