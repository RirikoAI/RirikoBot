import { provider } from "./provider";
import { createI18n } from "@dashboard/hooks/i18n";
import { enAuth } from "languages/en";
import { cnAuth } from "languages/zh";
import { msAuth } from "languages/ms";
import { jaAuth } from "languages/ja";

export const auth = createI18n(provider, {
  en: enAuth,
  cn: cnAuth,
  ms: msAuth,
  ja: jaAuth
});
