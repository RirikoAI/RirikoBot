import { provider } from "./provider";
import { createI18n } from "@dashboard/hooks/i18n";
import { enGuild } from "../../../../languages/en";
import { cnGuild } from "languages/zh";
import { msGuild } from "../../../../languages/ms";
import { jaGuild } from "languages/ja";

export const guild = createI18n(provider, {
  en: enGuild,
  cn: cnGuild,
  ms: msGuild,
  ja: jaGuild
});
