import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Request,
  Post,
  UseGuards,
  Patch,
  Delete,
  SerializeOptions,
  Req,
  Res,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthEmailLoginDto } from './dto/auth-email-login.dto';
import { AuthForgotPasswordDto } from './dto/auth-forgot-password.dto';
import { AuthConfirmEmailDto } from './dto/auth-confirm-email.dto';
import { AuthResetPasswordDto } from './dto/auth-reset-password.dto';
import { AuthUpdateDto } from './dto/auth-update.dto';
import { AuthGuard } from '@nestjs/passport';
import { AuthRegisterLoginDto } from './dto/auth-register-login.dto';
import { LoginResponseType } from './types/login-response.type';
import { NullableType } from '#util/types/nullable.type';
import { User } from '#database/entities/user.entity';
import {
  AuthenticatedGuard,
  DiscordAuthGuard,
} from '#util/auth/discord-auth-guard.util';
import { JweService } from '#jwe/jwe.service';

@ApiTags('Auth')
@Controller({
  path: 'auth',
  version: '1',
})
export class AuthController {
  constructor(
    private readonly service: AuthService,
    private readonly jweService: JweService,
  ) {}

  @SerializeOptions({
    groups: ['me'],
  })
  @Get('discord/redirect')
  @UseGuards(DiscordAuthGuard)
  async redirect(@Res({ passthrough: true }) res: any, @Request() req: any) {
    const data = await this.service.validateDiscordUser(req.user);

    const backendDomain = process.env.BACKEND_URL.replace('http://', '')
      .replace('https://', '')
      .split(':')[0];

    if (data.token) {
      // Set HTTP-only cookies
      res.cookie('access_token', data.token, {
        httpOnly: true,
        secure: false,
        sameSite: 'strict',
        maxAge: 3600000,
        domain: backendDomain,
      });

      res.cookie('refresh_token', data.refreshToken, {
        httpOnly: true,
        secure: false,
        sameSite: 'strict',
        maxAge: 7 * 24 * 3600000,
        domain: backendDomain,
      });

      res.cookie('expires_at', data.tokenExpires, {
        httpOnly: true,
        secure: false,
        sameSite: 'strict',
        maxAge: 3600000,
        domain: backendDomain,
      });

      res.cookie(
        'discord_access_token',
        await this.jweService.encrypt(data.payload.discord.discordAccessToken),
        {
          httpOnly: true,
          secure: false,
          sameSite: 'strict',
          maxAge: 3600000,
          domain: backendDomain,
        },
      );

      res.redirect(process.env.FRONTEND_URL + '/callback');
    }
  }

  @SerializeOptions({
    groups: ['me'],
  })
  @Get('discord/login')
  @UseGuards(DiscordAuthGuard)
  discordLogin() {
    return { msg: 'Login' };
  }

  @SerializeOptions({
    groups: ['me'],
  })
  @Get('getToken')
  getToken(@Req() req: Request) {
    const cookies = require('cookie').parse(req.headers['cookie'] || '');
    const access_token = cookies['access_token'];
    const refresh_token = cookies['refresh_token'];
    const expires_at = cookies['expires_at'];

    return {
      access_token,
      refresh_token,
      expires_at,
    };
  }

  @Get('status')
  @UseGuards(AuthenticatedGuard)
  @HttpCode(HttpStatus.OK)
  status(@Req() req: any) {
    return req.user;
  }

  @SerializeOptions({
    groups: ['me'],
  })
  @Post('email/login')
  @HttpCode(HttpStatus.OK)
  public login(
    @Body() loginDto: AuthEmailLoginDto,
  ): Promise<LoginResponseType> {
    return this.service.validateLogin(loginDto);
  }

  @Post('email/register')
  @HttpCode(HttpStatus.NO_CONTENT)
  async register(@Body() createUserDto: AuthRegisterLoginDto): Promise<void> {
    return this.service.register(createUserDto);
  }

  @Post('email/confirm')
  @HttpCode(HttpStatus.NO_CONTENT)
  async confirmEmail(
    @Body() confirmEmailDto: AuthConfirmEmailDto,
  ): Promise<void> {
    return this.service.confirmEmail(confirmEmailDto.hash);
  }

  @Post('forgot/password')
  @HttpCode(HttpStatus.NO_CONTENT)
  async forgotPassword(
    @Body() forgotPasswordDto: AuthForgotPasswordDto,
  ): Promise<void> {
    return this.service.forgotPassword(forgotPasswordDto.email);
  }

  @Post('reset/password')
  @HttpCode(HttpStatus.NO_CONTENT)
  resetPassword(@Body() resetPasswordDto: AuthResetPasswordDto): Promise<void> {
    return this.service.resetPassword(
      resetPasswordDto.hash,
      resetPasswordDto.password,
    );
  }

  @ApiBearerAuth()
  @SerializeOptions({
    groups: ['me'],
  })
  @Get('me')
  @UseGuards(AuthGuard('jwt'))
  @HttpCode(HttpStatus.OK)
  public async me(@Request() request): Promise<any> {
    const user = await this.service.me(request.user);
    return {
      ...user,
      metadata: {
        ...request.user.metadata,
      },
    };
  }

  @ApiBearerAuth()
  @SerializeOptions({
    groups: ['me'],
  })
  @Post('refresh')
  @UseGuards(AuthGuard('jwt-refresh'))
  @HttpCode(HttpStatus.OK)
  public refresh(@Request() request): Promise<Omit<LoginResponseType, 'user'>> {
    return this.service.refreshToken({
      sessionId: request.user.sessionId,
    });
  }

  @ApiBearerAuth()
  @Post('logout')
  @UseGuards(AuthGuard('jwt'))
  @HttpCode(HttpStatus.NO_CONTENT)
  public async logout(@Request() request): Promise<void> {
    await this.service.logout({
      sessionId: request.user.sessionId,
    });
  }

  @ApiBearerAuth()
  @SerializeOptions({
    groups: ['me'],
  })
  @Patch('me')
  @UseGuards(AuthGuard('jwt'))
  @HttpCode(HttpStatus.OK)
  public update(
    @Request() request,
    @Body() userDto: AuthUpdateDto,
  ): Promise<NullableType<User>> {
    return this.service.update(request.user, userDto);
  }

  @ApiBearerAuth()
  @Delete('me')
  @UseGuards(AuthGuard('jwt'))
  @HttpCode(HttpStatus.NO_CONTENT)
  public async delete(@Request() request): Promise<void> {
    return this.service.softDelete(request.user);
  }
}
