import { Pid } from '@yoman/shared/common';
import { z } from 'zod';
import { toAppId } from './app-id.js';

/** A list from a desktop with many windows is a few kB; anything far larger is not trusted. */
export const MAX_REPLY_LENGTH = 1_048_576;
/** More windows than anyone keeps open; a longer list is rejected, not truncated. */
export const MAX_WINDOWS = 1_000;
/** Raw `wm_class` values are short; a list with a far longer one is not trusted. */
export const MAX_WM_CLASS_LENGTH = 1_024;

/** `List` replies with one `s`: a JSON array of windows. */
const ListReply = z.tuple([z.string().max(MAX_REPLY_LENGTH)]);

/**
 * Only the fields the sample needs. `z.object` strips everything else,
 * so the untrusted title never leaves this parser (SPEC §4.1, SECURITY A11).
 * `pid` stays loose here, since Mutter reports `-1` when it is unknown.
 */
const ListedWindow = z.object({
  wm_class: z.string().max(MAX_WM_CLASS_LENGTH).nullable(),
  pid: z.int(),
  focus: z.boolean(),
});

const WindowList = z.array(ListedWindow).max(MAX_WINDOWS);

/** The focused window, as far as the sample needs it. */
export interface FocusedWindow {
  readonly wmClass: string;
  readonly pid: number;
}

export type WindowListResult =
  | { readonly status: 'focused'; readonly window: FocusedWindow }
  /** Nothing trackable has focus: the desktop, or a window without a class or a pid. */
  | { readonly status: 'none' }
  | { readonly status: 'malformed' };

const NONE: WindowListResult = { status: 'none' };
const MALFORMED: WindowListResult = { status: 'malformed' };

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

/** Parses a Window Calls `List` reply into the focused window. */
export function parseWindowList(body: readonly unknown[]): WindowListResult {
  const reply = ListReply.safeParse(body);
  if (!reply.success) {
    return MALFORMED;
  }
  const windows = WindowList.safeParse(parseJson(reply.data[0]));
  if (!windows.success) {
    return MALFORMED;
  }
  const focused = windows.data.find((window) => window.focus);
  if (focused === undefined || focused.wm_class === null) {
    return NONE;
  }
  const wmClass = toAppId(focused.wm_class);
  const pid = Pid.safeParse(focused.pid);
  if (wmClass === undefined || !pid.success) {
    return NONE;
  }
  return { status: 'focused', window: { wmClass, pid: pid.data } };
}
