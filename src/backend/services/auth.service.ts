import { AccessToken } from './discord.service';
import { TokenCookie } from "../middlewares/auth.middleware";

export function setCookie(res, token: AccessToken) {
  res.cookie(TokenCookie, JSON.stringify(token), {
    httpOnly: true,
    maxAge: token.expires_in,
  });
}
