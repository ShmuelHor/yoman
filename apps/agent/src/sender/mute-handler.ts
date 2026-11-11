import { z } from 'zod';
import { MuteRequest } from '../actuators/muter/domain/mute-request.js';
import type { ReplyHandler } from './reply-handlers.js';

/**
 * The part of an ingest reply the muter reads. `IngestResult` does not carry
 * mute commands yet (#150); until it does, no reply reaches this handler with
 * one. Once it does, replace this seam with the typed field and drop the parse.
 */
const ReplyWithMute = z.looseObject({ mute: MuteRequest.optional() });

export type RunMute = (request: MuteRequest) => Promise<void>;

/** Hands the gateway's mute commands, when a reply has any, to the muter. */
export function muteOnReply(name: string, runMute: RunMute): ReplyHandler {
  return {
    name,
    async handle(reply): Promise<void> {
      const parsed = ReplyWithMute.safeParse(reply);
      if (parsed.success && parsed.data.mute !== undefined) {
        await runMute(parsed.data.mute);
      }
    },
  };
}
