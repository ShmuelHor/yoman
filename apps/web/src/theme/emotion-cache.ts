import createCache, { type EmotionCache } from '@emotion/cache';
import rtlPlugin from '@mui/stylis-plugin-rtl';
import { prefixer } from 'stylis';

import type { Direction } from '../i18n/languages.js';

/**
 * One Emotion cache per direction. The right-to-left one mirrors MUI's
 * physical CSS (margin-left becomes margin-right, and so on); logical
 * properties pass through untouched. Each cache has its own class prefix, so
 * both can style the same page, as the dev components gallery does.
 */
const caches: Readonly<Record<Direction, EmotionCache>> = {
  ltr: createCache({ key: 'ltr', stylisPlugins: [prefixer] }),
  rtl: createCache({ key: 'rtl', stylisPlugins: [prefixer, rtlPlugin] }),
};

export function emotionCacheFor(direction: Direction): EmotionCache {
  return caches[direction];
}
