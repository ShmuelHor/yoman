import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { type ReactNode, useState } from 'react';
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
import { LocaleProvider } from '../../theme/locale-provider.js';
import type { ResolvedTheme } from '../../theme/theme.js';

const PATH = 'dev/components';
const NAMESPACE = 'dev-components';
/** Far after every product page, so it never competes for an order. */
const ORDER = 1000;
const THEMES: readonly ResolvedTheme[] = ['light', 'dark'];
const PANEL_MIN_WIDTH_PX = 360;

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

function Section({
  title,
  children,
}: {
  readonly title: string;
  readonly children: ReactNode;
}): React.JSX.Element {
  return (
    <Stack spacing={3} useFlexGap>
      <Typography variant="label" component="h3">
        {title}
      </Typography>
      <Stack direction="row" spacing={3} useFlexGap sx={{ flexWrap: 'wrap', alignItems: 'center' }}>
        {children}
      </Stack>
    </Stack>
  );
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
      <Section title={t('section.buttons')}>
        <Button variant="primary">{t('button.primary')}</Button>
        <Button>{t('button.secondary')}</Button>
        <Button disabled>{t('button.disabled')}</Button>
      </Section>
      <Section title={t('section.input')}>
        <Input label={t('input.label')} placeholder={t('input.placeholder')} />
      </Section>
      <Section title={t('section.switch')}>
        <Switch checked={focusOn} onChange={setFocusOn} label={t('switch.on')} />
        <Switch checked={quietOn} onChange={setQuietOn} label={t('switch.off')} />
      </Section>
      <Section title={t('section.tags')}>
        <Tag>{t('tag.default')}</Tag>
        <Tag variant="anomaly">{t('tag.anomaly')}</Tag>
      </Section>
      <Section title={t('section.navTabs')}>
        <NavTab to={`/${PATH}`}>{t('navTab.current')}</NavTab>
        <NavTab to="/">{t('navTab.other')}</NavTab>
      </Section>
      <Section title={t('section.cards')}>
        <Stack spacing={3} useFlexGap sx={{ inlineSize: '100%' }}>
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
        </Stack>
      </Section>
      <Section title={t('section.alert')}>
        <AlertCard title={t('alert.title')}>
          {t('alert.body', { share: percent.format(SAMPLE.drainShare) })}
        </AlertCard>
      </Section>
    </>
  );
}

/**
 * One language in one theme. `data-theme` on the panel switches every color
 * variable inside it, so both themes render side by side whatever the app
 * theme is, and LocaleProvider lays it out in the panel's own direction.
 */
function Panel({ language, theme }: PanelProps): React.JSX.Element {
  const { t } = useTranslation('common', { lng: language });
  const { t: tPage } = useTranslation(NAMESPACE, { lng: language });
  return (
    <LocaleProvider language={language}>
      <Stack
        component="section"
        data-theme={theme}
        lang={language}
        dir={directionOf(language)}
        spacing={3}
        useFlexGap
        sx={{
          padding: 6,
          border: 1,
          borderColor: 'divider',
          borderRadius: 1,
          bgcolor: 'background.default',
          color: 'text.primary',
        }}
      >
        <Typography variant="h2">
          {tPage('panel', { language: t(`language.${language}`), theme: t(`theme.${theme}`) })}
        </Typography>
        <Gallery language={language} />
      </Stack>
    </LocaleProvider>
  );
}

/** Every design system component in light and dark, Hebrew and English (T26). */
function DevComponentsPage(): React.JSX.Element {
  const { t } = useTranslation(NAMESPACE);
  return (
    <>
      <Typography variant="h1">{t('title')}</Typography>
      <Typography>{t('intro')}</Typography>
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: `repeat(auto-fit, minmax(${PANEL_MIN_WIDTH_PX}px, 1fr))`,
          gap: 6,
        }}
      >
        {Language.options.flatMap((language) =>
          THEMES.map((theme) => (
            <Panel key={`${language}-${theme}`} language={language} theme={theme} />
          )),
        )}
      </Box>
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
