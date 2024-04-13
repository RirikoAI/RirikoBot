import { initLanguages, initI18n } from "@dashboard/hooks/i18n";
import { useSettingsStore } from "@dashboard/stores";
import { availableLanguages } from "languages/index";

/**
 * Supported languages
 */
export type Languages =  "en" | "cn" | "ms" | "ja";
export const {languages, names} = initLanguages<Languages>({
  en: "English",
  ms: "Bahasa Malaysia",
  cn: "中文",
  ja: "日本語",
});

export const provider = initI18n({
  getLang: () => useSettingsStore.getState().lang,
  useLang: () => useSettingsStore((s) => s.lang),
});
