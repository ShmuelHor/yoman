/**
 * C0 and C1 controls, plus the bidi marks, embeddings, overrides and isolates.
 * A process name with a right-to-left override could make a notification
 * read as something else, so values never carry them.
 */
const UNSAFE_CHARACTERS = /[\p{Cc}‎‏‪-‮⁦-⁩]/gu;

const MARKUP_ENTITIES: Readonly<Record<string, string>> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

/** A value from outside (a process or goal name) with every control character removed. */
export function plainText(value: string): string {
  return value.replace(UNSAFE_CHARACTERS, '');
}

/**
 * Escapes text for a notification body. The freedesktop spec lets servers
 * read a subset of markup in the body (GNOME Shell does), so a value such
 * as `<b>` must show as text, not format the message.
 */
export function escapeMarkup(text: string): string {
  return text.replace(/[&<>"']/gu, (character) => MARKUP_ENTITIES[character] ?? character);
}
