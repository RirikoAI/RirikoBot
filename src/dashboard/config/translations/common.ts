import { provider } from "./provider";
import { createI18n } from "@dashboard/hooks/i18n";
import { enCommon } from "languages/en";
import { cnCommon } from "languages/zh";
import { msCommon } from "languages/ms";
import { jaCommon } from "languages/ja";

export const common = createI18n(provider, {
  en: enCommon,
  cn: cnCommon,
  ms: msCommon,
  ja: jaCommon
});
