import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Profile, Strategy } from 'passport-discord';
import { Done } from '#util/types/auth.type';
import { UsersService } from '#users/users.service';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class DiscordStrategy extends PassportStrategy(Strategy) {
  constructor(
    private readonly userService: UsersService,
    public configService: ConfigService,
  ) {
    super({
      clientID: configService.get<string>('discord.discordApplicationId'),
      clientSecret: configService.get<string>(
        'discord.discordOauth2ClientSecret',
      ),
      callbackURL:
        configService.get<string>('app.backendURL') +
        configService.get<string>('discord.discordRedirectUri'),
      scope: ['identify', 'email', 'guilds', 'guilds.join'],
    });
  }

  async validate(
    accessToken: string,
    refreshToken: string,
    profile: Profile,
    done: Done,
  ) {
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
