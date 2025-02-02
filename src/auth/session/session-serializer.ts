import { Inject } from '@nestjs/common';
import { PassportSerializer } from '@nestjs/passport';
import { AuthService } from '#auth/auth.service';
import { AuthServiceInterface } from '#auth/auth-service.interface';
import { User } from '#database/entities/user.entity';
import { Done } from '#util/types/auth.type';

export class SessionSerializer extends PassportSerializer {
  constructor(
    @Inject(AuthService) private readonly authService: AuthServiceInterface,
  ) {
    super();
  }

  serializeUser(user: User, done: Done) {
    done(null, user);
  }

  async deserializeUser(user: User, done: Done) {
    const userDB = await this.authService.findUser({
      discordId: user.id,
    });
    return userDB ? done(null, userDB) : done(null, null);
  }
}
