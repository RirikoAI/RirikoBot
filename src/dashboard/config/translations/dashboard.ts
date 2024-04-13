import { provider } from "./provider";
import { createI18n } from "@dashboard/hooks/i18n";
import { enDashboard } from "languages/en";
import { cnDashboard } from "languages/zh";
import { msDashboard } from "languages/ms";
import { jaDashboard } from "languages/ja";

export const dashboard = createI18n(provider, {
  en: enDashboard,
  cn: cnDashboard,
  ms: msDashboard,
  ja: jaDashboard
});
