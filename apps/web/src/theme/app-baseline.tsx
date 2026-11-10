import CssBaseline from '@mui/material/CssBaseline';
import GlobalStyles from '@mui/material/GlobalStyles';
import type { CSSObject, Theme } from '@mui/material/styles';

/** Space between an element and its focus ring, in theme spacing units. */
const FOCUS_OFFSET = 1;
const FOCUS_RING_PX = 2;

function globalStyles(theme: Theme): CSSObject {
  return {
    ':focus-visible': {
      outline: `${FOCUS_RING_PX}px solid ${theme.vars.palette.tokens.text}`,
      outlineOffset: theme.spacing(FOCUS_OFFSET),
    },
  };
}

/**
 * The page-wide styles: MUI's reset (border-box, no body margin, body colors
 * and font from the theme) and a focus ring in the text color.
 */
export function AppBaseline(): React.JSX.Element {
  return (
    <>
      <CssBaseline />
      <GlobalStyles styles={globalStyles} />
    </>
  );
}
