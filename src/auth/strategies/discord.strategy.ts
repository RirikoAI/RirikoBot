import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Profile, Strategy } from 'passport-discord';
import { Done } from '#util/types/auth.type';
import { UsersService } from '#users/users.service';

@Injectable()
export class DiscordStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly userService: UsersService) {
    super({
      clientID: process.env.DISCORD_APPLICATION_ID,
      clientSecret: process.env.DISCORD_OAUTH2_CLIENT_SECRET,
      callbackURL: process.env.BACKEND_URL + process.env.DISCORD_REDIRECT_URI,
      scope: ['identify', 'email', 'guilds', 'guilds.join'],
    });
  }

  async validate(
    accessToken: string,
    refreshToken: string,
    profile: Profile,
    done: Done,
  ) {
    // const { id: discordId, email, discriminator, username, avatar } = profile;
    const { id: discordId } = profile;

    const user = await this.userService.findOne({
      id: discordId,
    });

    if (user) {
      done(null, {
        discord: {
          discordAccessToken: accessToken,
          discordRefreshToken: refreshToken,
          ...profile,
        },
        user: {
          ...user,
        },
      });
    } else {
      // create a new user
    }
  }
}
