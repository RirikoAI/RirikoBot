import { Request, Response, NextFunction } from 'express';
import { AccessToken } from "../services/discord.service";

export const TokenCookie = 'ts-token';

export function auth(req: Request) {
  const data = req.cookies[TokenCookie] as string | null;
  const token: AccessToken | null =
    data == null ? null : (JSON.parse(data) as AccessToken);
  
  if (token == null || token.access_token == null) {
    throw new Error('You must login first');
  }
  
  return token;
}

export interface AuthRequest extends Request {
  user: AccessToken;
}