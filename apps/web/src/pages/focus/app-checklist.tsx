import Checkbox from '@mui/material/Checkbox';
import FormControlLabel from '@mui/material/FormControlLabel';
import FormGroup from '@mui/material/FormGroup';
import FormLabel from '@mui/material/FormLabel';
import Stack from '@mui/material/Stack';

import { Tag } from '../../components/tag.js';

interface AppChecklistProps {
  readonly legend: string;
  readonly appIds: readonly string[];
  readonly selected: readonly string[];
  /** Shown as text: names come from the desktop and are untrusted. */
  readonly labelOf: (appId: string) => string;
  /** Apps that no profile mentions yet get a "new" tag. */
  readonly isNew: (appId: string) => boolean;
  readonly newLabel: string;
  readonly onChange: (selected: string[]) => void;
}

/** A group of checkboxes, one per app. */
export function AppChecklist({
  legend,
  appIds,
  selected,
  labelOf,
  isNew,
  newLabel,
  onChange,
}: AppChecklistProps): React.JSX.Element {
  const toggle = (appId: string, checked: boolean): void =>
    onChange(checked ? [...selected, appId] : selected.filter((id) => id !== appId));
  return (
    <Stack spacing={1} component="fieldset" sx={{ border: 0, margin: 0, padding: 0 }}>
      <FormLabel component="legend" sx={{ typography: 'label' }}>
        {legend}
      </FormLabel>
      <FormGroup>
        {appIds.map((appId) => (
          <FormControlLabel
            key={appId}
            label={
              <>
                {labelOf(appId)}
                {isNew(appId) ? <Tag variant="anomaly">{newLabel}</Tag> : null}
              </>
            }
            control={
              <Checkbox
                checked={selected.includes(appId)}
                onChange={(_event, checked): void => toggle(appId, checked)}
              />
            }
          />
        ))}
      </FormGroup>
    </Stack>
  );
}
