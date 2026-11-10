import { Alert } from '@yoman/shared/alerts';
import { Language } from '@yoman/shared/settings';
import { z } from 'zod';

/**
 * What the notifier shows: one alert the gateway decided to deliver now
 * (`IngestResult.deliver`), in the user's language. Without a language the
 * notification is in Hebrew, the product's default.
 */
export const NotifyRequest = z.strictObject({
  alert: Alert,
  language: Language.optional(),
});
export type NotifyRequest = z.infer<typeof NotifyRequest>;
