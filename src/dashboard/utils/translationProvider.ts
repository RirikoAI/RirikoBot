import { initLanguages, initI18n, createI18n } from "@dashboard/hooks/i18n";
import { useSettingsStore } from "@dashboard/stores";
import { enAuth, enCommon, enDashboard, enFeature, enFeatures, enGuild, enHome, enProfile } from "../../languages/en";
import { cnAuth, cnCommon, cnDashboard, cnFeature, cnFeatures, cnGuild, cnHome, cnProfile } from "../../languages/zh";
import { msAuth, msCommon, msDashboard, msFeature, msFeatures, msGuild, msHome, msProfile } from "../../languages/ms";
import { jaAuth, jaCommon, jaDashboard, jaFeature, jaFeatures, jaGuild, jaHome, jaProfile } from "../../languages/ja";
import { deAuth, deCommon, deDashboard, deFeature, deFeatures, deGuild, deHome, deProfile } from "../../languages/de";

export const LanguageISO = [
  "en", "cn", "ms", "ja", "de"
] as const;

export const Languages = {
  "en": "English",
  "ms": "Bahasa Malaysia",
  "cn": "中文",
  "ja": "日本語",
  "de": "Deutsch"
}

/**
 * Supported languages
 */
export const {languages, names} = initLanguages<typeof LanguageISO[number]>({
  ...Languages
});

export const translationProvider = initI18n({
  getLang: () => useSettingsStore.getState().lang,
  useLang: () => useSettingsStore((s) => s.lang),
});

export const authI18n = createI18n(translationProvider, {
  en: enAuth,
  cn: cnAuth,
  ms: msAuth,
  ja: jaAuth,
  de: deAuth
});

export const musicI18n = createI18n(translationProvider, {
  en: enAuth,
  cn: cnAuth,
  ms: msAuth,
  ja: jaAuth,
  de: deAuth
});

export const dashboardI18n = createI18n(translationProvider, {
  en: enDashboard,
  cn: cnDashboard,
  ms: msDashboard,
  ja: jaDashboard,
  de: deDashboard
});

export const featuresI18b = createI18n(translationProvider, {
  ms: msFeatures,
  en: enFeatures,
  cn: cnFeatures,
  ja: jaFeatures,
  de: deFeatures
});

export const commonI18b = createI18n(translationProvider, {
  en: enCommon,
  cn: cnCommon,
  ms: msCommon,
  ja: jaCommon,
  de: deCommon
});

export const featureI18b = createI18n(translationProvider, {
  en: enFeature,
  cn: cnFeature,
  ms: msFeature,
  ja: jaFeature,
  de: deFeature
});

export const guildI18b = createI18n(translationProvider, {
  en: enGuild,
  cn: cnGuild,
  ms: msGuild,
  ja: jaGuild,
  de: deGuild
});

export const homeI18b = createI18n(translationProvider, {
  en: enHome,
  cn: cnHome,
  ms: msHome,
  ja: jaHome,
  de: deHome
});

export const profileI18b = createI18n(translationProvider, {
  en: enProfile,
  cn: cnProfile,
  ms: msProfile,
  ja: jaProfile,
  de: deProfile
});
