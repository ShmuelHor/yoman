import FormControl from '@mui/material/FormControl';
import InputLabel from '@mui/material/InputLabel';
import MenuItem from '@mui/material/MenuItem';
import Select, { type SelectChangeEvent } from '@mui/material/Select';
import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { NavLink, Outlet } from 'react-router';

import { DEFAULT_LANGUAGE, Language } from '../i18n/languages.js';
import { hrefOf, navPages, type PageRoute } from '../router/page-route.js';
import { ThemePreference } from '../theme/theme.js';
import { useTheme } from '../theme/theme-provider.js';

interface LayoutProps {
  readonly pages: readonly PageRoute[];
}

function NavItem({ page }: { readonly page: PageRoute }): React.JSX.Element {
  const { t } = useTranslation(page.namespace);
  return (
    <li>
      <NavLink to={hrefOf(page)} end>
        {t('title')}
      </NavLink>
    </li>
  );
}

interface ShellSelectProps<T extends string> {
  readonly label: string;
  readonly value: T;
  readonly options: readonly T[];
  readonly optionLabel: (option: T) => string;
  /** Receives the raw value MUI reports, so the caller parses it with its schema. */
  readonly onChange: (value: string) => void;
}

/** A small labelled MUI select for the shell's header. */
function ShellSelect<T extends string>({
  label,
  value,
  options,
  optionLabel,
  onChange,
}: ShellSelectProps<T>): React.JSX.Element {
  const labelId = useId();
  return (
    <FormControl size="small">
      <InputLabel id={labelId}>{label}</InputLabel>
      <Select
        labelId={labelId}
        label={label}
        value={value}
        onChange={(event: SelectChangeEvent<T>): void => onChange(event.target.value)}
      >
        {options.map((option) => (
          <MenuItem key={option} value={option}>
            {optionLabel(option)}
          </MenuItem>
        ))}
      </Select>
    </FormControl>
  );
}

function LanguagePicker(): React.JSX.Element {
  const { t, i18n } = useTranslation();
  const current = Language.safeParse(i18n.resolvedLanguage);
  return (
    <ShellSelect
      label={t('language.label')}
      value={current.success ? current.data : DEFAULT_LANGUAGE}
      options={Language.options}
      optionLabel={(language): string => t(`language.${language}`)}
      onChange={(value): void => {
        void i18n.changeLanguage(Language.parse(value));
      }}
    />
  );
}

function ThemePicker(): React.JSX.Element {
  const { t } = useTranslation();
  const { preference, setPreference } = useTheme();
  return (
    <ShellSelect
      label={t('theme.label')}
      value={preference}
      options={ThemePreference.options}
      optionLabel={(theme): string => t(`theme.${theme}`)}
      onChange={(value): void => setPreference(ThemePreference.parse(value))}
    />
  );
}

/** The app shell: navigation built from the registered pages (dev-only ones excluded), and the current page. */
export function Layout({ pages }: LayoutProps): React.JSX.Element {
  const { t } = useTranslation();
  return (
    <>
      <header>
        <span>{t('appName')}</span>
        <nav aria-label={t('nav.label')}>
          <ul>
            {navPages(pages).map((page) => (
              <NavItem key={page.path} page={page} />
            ))}
          </ul>
        </nav>
        <LanguagePicker />
        <ThemePicker />
      </header>
      <main>
        <Outlet />
      </main>
    </>
  );
}
