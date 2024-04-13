import { provider } from "./provider";
import { createI18n } from "@dashboard/hooks/i18n";
import { enHome } from "languages/en";
import { cnHome } from "languages/zh";
import { msHome } from "languages/ms";
import { jaHome } from "languages/ja";

export const home = createI18n(provider, {
  en: enHome,
  cn: cnHome,
  ms: msHome,
  ja: jaHome
});
