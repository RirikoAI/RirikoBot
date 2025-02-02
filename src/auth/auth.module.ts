import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtModule } from '@nestjs/jwt';
import { JwtStrategy } from './strategies/jwt.strategy';
import { AnonymousStrategy } from './strategies/anonymous.strategy';
import { UsersModule } from '#users/users.module';
import { ForgotModule } from '#auth/forgot/forgot.module';
import { MailModule } from '#mail/mail.module';
import { IsExist } from '#util/validators/is-exists.validator';
import { IsNotExist } from '#util/validators/is-not-exists.validator';
import { JwtRefreshStrategy } from './strategies/jwt-refresh.strategy';
import { SessionModule } from '#auth/session/session.module';
import { DiscordStrategy } from '#auth/strategies/discord.strategy';
import { SessionSerializer } from '#auth/session/session-serializer';
import { JweModule } from '#jwe/jwe.module';
import { JweService } from '#jwe/jwe.service';
import { JwksModule } from '#jwks/jwks.module';
import { JwksService } from '#jwks/jwks.service';

@Module({
  imports: [
    UsersModule,
    ForgotModule,
    SessionModule,
    MailModule,
    JwtModule.register({}),
    JwksModule,
    JweModule,
  ],
  controllers: [AuthController],
  providers: [
    SessionSerializer,
    IsExist,
    IsNotExist,
    AuthService,
    JwtStrategy,
    DiscordStrategy,
    JwtRefreshStrategy,
    AnonymousStrategy,
    JwksService,
    JweService,
  ],
  exports: [AuthService],
})
export class AuthModule {}
