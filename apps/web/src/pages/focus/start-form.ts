import { ClockTime, EntityId } from '@yoman/shared/common';
import { FocusStart } from '@yoman/shared/focus';
import { z } from 'zod';

/**
 * The start-focus form: a profile (empty means the default one) and either a
 * duration or an end time, with one field per mode because a form cannot
 * hold a union. It transforms into the contract's `FocusStart`.
 */
export const StartForm = z
  .object({
    profileId: z.union([z.literal(''), EntityId]),
    mode: z.enum(['minutes', 'until']),
    minutes: z.number(),
    until: z.string(),
  })
  .transform((form, ctx): FocusStart => {
    const profile = form.profileId === '' ? {} : { profileId: form.profileId };
    const parsed =
      form.mode === 'minutes'
        ? FocusStart.safeParse({ ...profile, minutes: form.minutes })
        : FocusStart.safeParse({ ...profile, until: ClockTime.safeParse(form.until).data });
    if (!parsed.success) {
      ctx.issues.push({
        code: 'custom',
        message: 'invalid duration',
        path: [form.mode],
        input: form.mode === 'minutes' ? form.minutes : form.until,
      });
      return z.NEVER;
    }
    return parsed.data;
  });
export type StartFormInput = z.input<typeof StartForm>;

/** A first session of 25 minutes with the default profile. */
export const NEW_START_FORM: StartFormInput = {
  profileId: '',
  mode: 'minutes',
  minutes: 25,
  until: '',
};
