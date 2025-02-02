import { User } from '#database/entities/user.entity';

export type UserDetails = {
  discordId: string;
  discordTag: string;
  avatar: string;
  email: string;
};

export type OAuth2Details = {
  discordId: string;
  accessToken: string;
  refreshToken: string;
};

export type FindUserParams = Partial<{
  discordId: string;
  discordTag: string;
  avatar: string;
  email: string;
}>;

export type FindOAuth2Params = Partial<{
  discordId: string;
  accessToken: string;
  refreshToken: string;
}>;

export type Done = (err: Error, payload: any) => void;

/**
 * <h1>ATTENTION!!!</h1>
 *
 * The payload contains such precious data, let's not console.log it anywhere at all nor save it to a log file.
 *
 * Serve it via API when the user requested it, where the user can provide their own CEK where we can encrypt it and only them can decrypt it.
 *
 * Minimize usage of this data, only use it when absolutely necessary.
 */
export type DiscordLoginPayload = {
  user: User;
  discord: {
    discordAccessToken: string;
    discordRefreshToken: string;
    id: string;
    email: string;
    discriminator: string;
    username: string;
    avatar: string;
  };
};
