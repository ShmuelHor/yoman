/**
 * How many buffered samples fit in one request. The gateway rejects bodies
 * over 1 MiB with a 413 (SECURITY A17), and 2,000 samples with long window
 * titles can exceed that, so a batch is cut by bytes as well as by count.
 */

/** Below the gateway's 1 MiB body limit, with room for its own accounting. */
export const MAX_BATCH_BYTES = 1_000_000;

/** The `,` between two array elements. */
const SEPARATOR_BYTES = 1;

/**
 * The longest prefix of the samples whose request body stays within `maxBytes`.
 * `envelopeBytes` is the body with an empty `samples` array; `sampleBytes`
 * are each sample's serialized size, in buffer order.
 */
export function fittingSampleCount(
  envelopeBytes: number,
  sampleBytes: readonly number[],
  maxBytes: number,
): number {
  let total = envelopeBytes;
  let count = 0;
  for (const bytes of sampleBytes) {
    total += bytes + (count === 0 ? 0 : SEPARATOR_BYTES);
    if (total > maxBytes) {
      break;
    }
    count += 1;
  }
  return count;
}
