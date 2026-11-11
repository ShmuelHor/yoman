import { randomUUID } from 'node:crypto';

const GENERATED_ID_LENGTH = 12;

/**
 * The cycle id that ties the agent's send to the gateway's and the services'
 * log lines. Same shape the gateway generates, so it passes its validation.
 */
export function createRequestId(): string {
  return `req-${randomUUID().replaceAll('-', '').slice(0, GENERATED_ID_LENGTH)}`;
}
