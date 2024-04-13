import { createI18n } from "@dashboard/hooks/i18n";
import { common } from "./common";
import { provider } from "./provider";
import { cnProfile } from "languages/zh";
import { enProfile } from "languages/en";
import { msProfile } from "languages/ms";
import { jaProfile } from "languages/ja";

export const profile = createI18n(provider, {
  en: enProfile,
  cn: cnProfile,
  ms: msProfile,
  ja: jaProfile
});
