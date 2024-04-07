/***
 * Custom types that should be configured by developer
 ***/

import { GuildInfo } from '.';

export type CustomGuildInfo = GuildInfo & {};

/** example only */
export type WelcomeMessageFeature = {
  channel?: string;
  message: string;
};

/** example only */
export type FarewellMessageFeature = {
  channel?: string;
  message: string;
};

/** example only */
export type MusicFeature = {
  message: string;
  channel?: string;

  role?: string;
  color?: string;
  count?: string;
  date?: Date;
  file?: File[];
  bool: boolean;
  tags: string[];
};
