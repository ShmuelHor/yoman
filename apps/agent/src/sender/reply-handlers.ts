import type { Alert } from '@yoman/shared/alerts';
import type { IngestResult } from '@yoman/shared/ingest';

/**
 * Something that acts on the gateway's answer to a batch (SPEC §3 ingest
 * flow). The sender calls every handler after the batch is acked, with a
 * reply already validated against `IngestResult`. A handler that throws is
 * logged and does not stop the others or cause a resend.
 */
export interface ReplyHandler {
  /** For logs, for example `notifier`. */
  readonly name: string;
  handle(reply: IngestResult): Promise<void>;
}

export type Notify = (alert: Alert) => Promise<void>;

/**
 * Adapts a per-alert function, such as the notifier's (T33), into a handler:
 * one call per alert the focus service let through, in order. One failed
 * alert does not hold back the rest; the failures are rethrown together.
 */
export function notifyEach(name: string, notify: Notify): ReplyHandler {
  return {
    name,
    async handle(reply): Promise<void> {
      const failures: unknown[] = [];
      for (const alert of reply.deliver) {
        try {
          await notify(alert);
        } catch (error: unknown) {
          failures.push(error);
        }
      }
      if (failures.length > 0) {
        throw new AggregateError(
          failures,
          `${failures.length} of ${reply.deliver.length} alerts failed`,
        );
      }
    },
  };
}
