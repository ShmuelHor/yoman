import type { ChangeEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { NavLink, Outlet } from 'react-router';

import { Language } from '../i18n/languages.js';
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

function LanguagePicker(): React.JSX.Element {
  const { t, i18n } = useTranslation();
  const onChange = (event: ChangeEvent<HTMLSelectElement>): void => {
    void i18n.changeLanguage(Language.parse(event.target.value));
  };
  return (
    <label>
      {t('language.label')}
      <select value={i18n.resolvedLanguage} onChange={onChange}>
        {Language.options.map((language) => (
          <option key={language} value={language}>
            {t(`language.${language}`)}
          </option>
        ))}
      </select>
    </label>
  );
}

function ThemePicker(): React.JSX.Element {
  const { t } = useTranslation();
  const { preference, setPreference } = useTheme();
  const onChange = (event: ChangeEvent<HTMLSelectElement>): void => {
    setPreference(ThemePreference.parse(event.target.value));
  };
  return (
    <label>
      {t('theme.label')}
      <select value={preference} onChange={onChange}>
        {ThemePreference.options.map((theme) => (
          <option key={theme} value={theme}>
            {t(`theme.${theme}`)}
          </option>
        ))}
      </select>
    </label>
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
