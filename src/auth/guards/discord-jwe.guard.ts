import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';
import { JweService } from '#jwe/jwe.service';

@Injectable()
export class DiscordJweGuard implements CanActivate {
  constructor(
    private readonly jweService: JweService,
  ) {
  }
  
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const cookies = require('cookie').parse(request.headers['cookie'] || '');
    const encryptedDiscordAccessToken = cookies['discord_access_token'];
    let decryptedAccessToken: any;
    try {
      decryptedAccessToken = await this.jweService.decrypt(
        encryptedDiscordAccessToken,
      );
      if (!decryptedAccessToken) {
        throw new HttpException(
          {
            status: HttpStatus.FORBIDDEN,
            errors: {
              discordAccessToken: 'notFound',
            },
          },
          HttpStatus.FORBIDDEN,
        );
      }
      request['discordAccessToken'] = decryptedAccessToken;
    } catch (e) {
      throw new UnauthorizedException('Invalid or missing Discord access token');
    }
    return true;
  }
  
  /**
   * ToDo: Watch when we receive 401/403 errors from Discord api, then refresh the tokens
   */
  refreshToken() {
  }
  
}
