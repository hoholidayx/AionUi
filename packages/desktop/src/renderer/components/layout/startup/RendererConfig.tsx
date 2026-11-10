import { ConfigProvider } from '@arco-design/web-react';
import React, { type PropsWithChildren } from 'react';
import { useTranslation } from 'react-i18next';
import { isRtlLanguage } from '@renderer/services/i18n/direction';
import enUS from '@arco-design/web-react/es/locale/en-US';
import jaJP from '@arco-design/web-react/es/locale/ja-JP';
import zhCN from '@arco-design/web-react/es/locale/zh-CN';
import zhTW from '@arco-design/web-react/es/locale/zh-TW';
import koKR from '@arco-design/web-react/es/locale/ko-KR';
import trTR from '@arco-design/web-react/es/locale/tr-TR';
import ruRU from '@arco-design/web-react/es/locale/ru-RU';
import ptBR from '@arco-design/web-react/es/locale/pt-BR';
import deDE from '@arco-design/web-react/es/locale/de-DE';
import esES from '@arco-design/web-react/es/locale/es-ES';
import frFR from '@arco-design/web-react/es/locale/fr-FR';

// Arco ships several locales that predate its newer components: sections such
// as Form, ColorPicker and the Calendar month/year formats are missing there.
// Backfill anything absent from the English locale so every entry satisfies the
// full locale shape (generalises the previous hand-written ko-KR patch).
type ArcoLocaleInput = Omit<Partial<typeof enUS>, 'Calendar' | 'DatePicker'> & {
  Calendar?: Partial<(typeof enUS)['Calendar']>;
  DatePicker?: Omit<Partial<(typeof enUS)['DatePicker']>, 'Calendar'> & {
    Calendar?: Partial<(typeof enUS)['DatePicker']['Calendar']>;
  };
};

const completeArcoLocale = (locale: ArcoLocaleInput): typeof enUS => ({
  ...enUS,
  ...locale,
  Calendar: {
    ...enUS.Calendar,
    ...locale.Calendar,
    monthFormat: locale.Calendar?.monthFormat ?? enUS.Calendar.monthFormat,
    yearFormat: locale.Calendar?.yearFormat ?? enUS.Calendar.yearFormat,
  },
  DatePicker: {
    ...enUS.DatePicker,
    ...locale.DatePicker,
    Calendar: {
      ...enUS.DatePicker.Calendar,
      ...locale.DatePicker?.Calendar,
      monthFormat: locale.DatePicker?.Calendar?.monthFormat ?? enUS.Calendar.monthFormat,
      yearFormat: locale.DatePicker?.Calendar?.yearFormat ?? enUS.Calendar.yearFormat,
    },
  },
  Form: locale.Form ?? enUS.Form,
  ColorPicker: locale.ColorPicker ?? enUS.ColorPicker,
});

// Every language AionUi ships that Arco publishes a locale for. Arco has no
// uk-UA or fa-IR locale; those fall back to English component strings.
const arcoLocales: Record<string, typeof enUS> = {
  'zh-CN': zhCN,
  'zh-TW': zhTW,
  'ja-JP': jaJP,
  'ko-KR': completeArcoLocale(koKR),
  'en-US': enUS,
  'tr-TR': completeArcoLocale(trTR),
  'ru-RU': completeArcoLocale(ruRU),
  'pt-BR': completeArcoLocale(ptBR),
  'de-DE': completeArcoLocale(deDE),
  'es-ES': completeArcoLocale(esES),
  'fr-FR': completeArcoLocale(frFR),
};

const RendererConfig: React.FC<PropsWithChildren> = ({ children }) => {
  const {
    i18n: { language },
  } = useTranslation();
  const arcoLocale = arcoLocales[language] ?? enUS;

  return React.createElement(
    ConfigProvider,
    { theme: { primaryColor: '#4E5969' }, locale: arcoLocale, rtl: isRtlLanguage(language) },
    children
  );
};

export default RendererConfig;
