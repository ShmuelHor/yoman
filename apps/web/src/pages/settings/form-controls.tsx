import FormControl from '@mui/material/FormControl';
import FormHelperText from '@mui/material/FormHelperText';
import FormLabel from '@mui/material/FormLabel';
import NativeSelect from '@mui/material/NativeSelect';
import OutlinedInput from '@mui/material/OutlinedInput';
import Stack from '@mui/material/Stack';
import { type ReactNode, useId } from 'react';
import type { UseFormRegisterReturn } from 'react-hook-form';

import { Input, type InputProps } from '../../components/input.js';

interface TextFieldProps {
  readonly label: string;
  readonly register: UseFormRegisterReturn;
  /** The translated message shown when the field is invalid. */
  readonly error: string | undefined;
  readonly type?: InputProps['type'];
  readonly multiline?: boolean;
  readonly helper?: string;
}

/** A labelled text input wired to a form, with its hint and error underneath. */
export function TextField({
  label,
  register,
  error,
  type,
  multiline,
  helper,
}: TextFieldProps): React.JSX.Element {
  // React Hook Form hands back `ref`, but the design-system input takes its DOM node as `inputRef`.
  const { ref, ...rest } = register;
  return (
    <Stack spacing={1}>
      <Input
        label={label}
        error={error !== undefined}
        {...(type === undefined ? {} : { type })}
        {...(multiline === true ? { multiline: true, minRows: 3 } : {})}
        {...rest}
        inputRef={ref}
      />
      {helper === undefined ? null : <FormHelperText>{helper}</FormHelperText>}
      {error === undefined ? null : <FormHelperText error>{error}</FormHelperText>}
    </Stack>
  );
}

interface SelectFieldProps {
  readonly label: string;
  readonly register: UseFormRegisterReturn;
  readonly children: ReactNode;
}

/** A native select, which keeps the keyboard and screen reader behavior of the platform. */
export function SelectField({ label, register, children }: SelectFieldProps): React.JSX.Element {
  const id = useId();
  const { ref, ...rest } = register;
  return (
    <FormControl sx={{ gap: 1 }}>
      <FormLabel htmlFor={id} sx={{ typography: 'label' }}>
        {label}
      </FormLabel>
      <NativeSelect
        input={<OutlinedInput size="small" />}
        inputRef={ref}
        inputProps={{ id, ...rest }}
      >
        {children}
      </NativeSelect>
    </FormControl>
  );
}
