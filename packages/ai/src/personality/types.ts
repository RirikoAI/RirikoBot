export type SpeakingStyle =
  | 'FRIENDLY_ANIME'
  | 'TSUNDERE'
  | 'KUUDERE'
  | 'DANDERE'
  | 'GENKI'
  | 'FORMAL';

export interface SanitizedIdentity {
  username: string;
  displayName: string;
  guildName?: string | undefined;
  joinedDate?: string | undefined;
}

export interface PromptAssemblyOptions {
  speakingStyle?: SpeakingStyle | string | undefined;
  customGuildPrompt?: string | null | undefined;
  identity?: SanitizedIdentity | undefined;
  currentTimeIso?: string | undefined;
  userTimezone?: string | undefined;
}
