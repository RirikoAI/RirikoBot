import { provider } from "./provider";
import { createI18n } from "@dashboard/hooks/i18n";
import { enFeature } from "languages/en";
import { cnFeature } from "languages/zh";
import { msFeature } from "languages/ms";
import { jaFeature } from "languages/ja";

export const feature = createI18n(provider, {
  en: enFeature,
  cn: cnFeature,
  ms: msFeature,
  ja: jaFeature
});
