import create from "zustand";
import { persist } from "zustand/middleware";
import { LanguageISO } from "@dashboard/utils/translationProvider";

export type PageStore = {
  sidebarIsOpen: boolean;
  setSidebarIsOpen: (v: boolean) => void;
};

export type PersistStore = {
  devMode: boolean;
  setDevMode: (v: boolean) => void;
  lang: typeof LanguageISO[number];
  setLang: (v: typeof LanguageISO[number]) => void;
};

export const usePageStore = create<PageStore>((set) => ({
  sidebarIsOpen: false,
  setSidebarIsOpen: (v) => set({ sidebarIsOpen: v }),
}));

/**
 * persist settings
 */
export const useSettingsStore = create(
  persist<PersistStore>(
    (set) => ({
      devMode: false,
      setDevMode: (v) => set({ devMode: v }),
      lang: "en",
      setLang: (v) => set({ lang: v }),
    }),
    {
      name: "settings",
    }
  )
);
