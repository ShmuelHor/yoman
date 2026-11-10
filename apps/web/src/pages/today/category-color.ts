import type { Theme } from '@mui/material/styles';

/** The DESIGN.md category color of a category slug; `null` is time away from the computer. */
export function categoryColor(theme: Theme, category: string | null): string {
  const tokens = theme.vars.palette.tokens;
  switch (category) {
    case null:
      return tokens.catIdle;
    case 'work':
      return tokens.catWork;
    case 'comms':
    case 'communication':
    case 'social':
      return tokens.catComms;
    case 'fun':
    case 'entertainment':
      return tokens.catFun;
    default:
      return tokens.catOther;
  }
}
