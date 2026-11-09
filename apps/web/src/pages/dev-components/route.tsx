import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { AlertCard } from '../../components/alert-card.js';
import { Button } from '../../components/button.js';
import { Card } from '../../components/card.js';
import { FocusBanner } from '../../components/focus-banner.js';
import { Input } from '../../components/input.js';
import { NavTab } from '../../components/nav-tab.js';
import { Switch } from '../../components/switch.js';
import { Tag } from '../../components/tag.js';
import { directionOf, Language } from '../../i18n/languages.js';
import type { PageRoute } from '../../router/page-route.js';
import type { ResolvedTheme } from '../../theme/theme.js';
import './dev-components.css';

const PATH = 'dev/components';
const NAMESPACE = 'dev-components';
/** Far after every product page, so it never competes for an order. */
const ORDER = 1000;
const THEMES: readonly ResolvedTheme[] = ['light', 'dark'];

/** Sample values, formatted per language through Intl like real data will be. */
const SAMPLE = {
  screenHours: 6.7,
  batteryShare: 0.82,
  minutesMore: 47,
  drainShare: 0.3,
  focusMinutesLeft: 47,
} as const;

interface PanelProps {
  readonly language: Language;
  readonly theme: ResolvedTheme;
}

function Gallery({ language }: { readonly language: Language }): React.JSX.Element {
  const { t } = useTranslation(NAMESPACE, { lng: language });
  const [focusOn, setFocusOn] = useState(true);
  const [quietOn, setQuietOn] = useState(false);
  const number = new Intl.NumberFormat(language);
  const percent = new Intl.NumberFormat(language, { style: 'percent' });
  const hours = new Intl.NumberFormat(language, {
    style: 'unit',
    unit: 'hour',
    maximumFractionDigits: 1,
  });

  return (
    <>
      <FocusBanner>
        {t('focusBanner', { minutes: number.format(SAMPLE.focusMinutesLeft) })}
      </FocusBanner>
      <h3>{t('section.buttons')}</h3>
      <div className="dev-components__row">
        <Button variant="primary">{t('button.primary')}</Button>
        <Button>{t('button.secondary')}</Button>
        <Button disabled>{t('button.disabled')}</Button>
      </div>
      <h3>{t('section.input')}</h3>
      <Input label={t('input.label')} placeholder={t('input.placeholder')} />
      <h3>{t('section.switch')}</h3>
      <div className="dev-components__row">
        <Switch checked={focusOn} onChange={setFocusOn} label={t('switch.on')} />
        <Switch checked={quietOn} onChange={setQuietOn} label={t('switch.off')} />
      </div>
      <h3>{t('section.tags')}</h3>
      <div className="dev-components__row">
        <Tag>{t('tag.default')}</Tag>
        <Tag variant="anomaly">{t('tag.anomaly')}</Tag>
      </div>
      <h3>{t('section.navTabs')}</h3>
      <div className="dev-components__row">
        <NavTab to={`/${PATH}`}>{t('navTab.current')}</NavTab>
        <NavTab to="/">{t('navTab.other')}</NavTab>
      </div>
      <h3>{t('section.cards')}</h3>
      <div className="dev-components__cards">
        <Card
          size="hero"
          label={t('card.heroLabel')}
          value={hours.format(SAMPLE.screenHours)}
          context={t('card.heroContext', { minutes: number.format(SAMPLE.minutesMore) })}
        />
        <Card
          label={t('card.secondaryLabel')}
          value={percent.format(SAMPLE.batteryShare)}
          context={t('card.secondaryContext')}
        />
      </div>
      <h3>{t('section.alert')}</h3>
      <AlertCard title={t('alert.title')}>
        {t('alert.body', { share: percent.format(SAMPLE.drainShare) })}
      </AlertCard>
    </>
  );
}

/**
 * One language in one theme. `data-theme` on the panel switches every token
 * inside it, so both themes render side by side whatever the app theme is.
 */
function Panel({ language, theme }: PanelProps): React.JSX.Element {
  const { t } = useTranslation('common', { lng: language });
  const { t: tPage } = useTranslation(NAMESPACE, { lng: language });
  return (
    <section
      className="dev-components__panel"
      data-theme={theme}
      lang={language}
      dir={directionOf(language)}
    >
      <h2>{tPage('panel', { language: t(`language.${language}`), theme: t(`theme.${theme}`) })}</h2>
      <Gallery language={language} />
    </section>
  );
}

/** Every design system component in light and dark, Hebrew and English (T26). */
function DevComponentsPage(): React.JSX.Element {
  const { t } = useTranslation(NAMESPACE);
  return (
    <>
      <h1>{t('title')}</h1>
      <p>{t('intro')}</p>
      <div className="dev-components__grid">
        {Language.options.flatMap((language) =>
          THEMES.map((theme) => (
            <Panel key={`${language}-${theme}`} language={language} theme={theme} />
          )),
        )}
      </div>
    </>
  );
}

export const route: PageRoute = {
  path: PATH,
  namespace: NAMESPACE,
  order: ORDER,
  devOnly: true,
  Component: DevComponentsPage,
};
