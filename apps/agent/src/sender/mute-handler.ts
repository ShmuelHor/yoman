import type { MuteRequest } from '../actuators/muter/domain/mute-request.js';
import type { ReplyHandler } from './reply-handlers.js';

export type RunMute = (request: MuteRequest) => Promise<void>;

/**
 * Hands the gateway's mute directive, when a reply carries one, to the muter.
 * The reply was already validated against `IngestResult`, so `mute` is typed.
 */
export function muteOnReply(name: string, runMute: RunMute): ReplyHandler {
  return {
    name,
    async handle(reply): Promise<void> {
      if (reply.mute !== undefined) {
        await runMute(reply.mute);
      }
    },
  };
}
