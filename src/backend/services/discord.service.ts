import { discordBotClientSecret, discordBotID } from "helpers/getconfig";

export const API_ENDPOINT = 'https://discord.com/api/v10';
export const CLIENT_ID = discordBotID();
export const CLIENT_SECRET = discordBotClientSecret();
const STATIC_URL = `${process.env.DOMAIN_NAME}:${process.env.BACKEND_PORT}`;
export const REDIRECT_URI = `${ STATIC_URL }/callback`;
export const WEB_URL = `${process.env.DOMAIN_NAME}:${process.env.PORT}`;

export type AccessToken = {
  access_token: string;
  token_type: 'Bearer';
  expires_in: number;
  refresh_token: string;
  scope: string;
};


export async function getUserID(accessToken: string) {
  const res = await fetch(`${ API_ENDPOINT }/users/@me`, {
    method: 'GET',
    headers: {
      Authorization: 'Bearer ' + accessToken,
    },
  });
  if (!res.ok)
    throw new Error(
      'Failed to get user data'
    );
  
  const user = (await res.json()) as {
    id: string;
  };
  return user.id;
}

export async function exchangeToken(code: string): Promise<AccessToken> {
  const data = new URLSearchParams({
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    grant_type: 'authorization_code',
    code: code,
    redirect_uri: REDIRECT_URI,
  });
  
  const headers = {
    'Content-Type': 'application/x-www-form-urlencoded',
  };
  
  const response = await fetch(`${ API_ENDPOINT }/oauth2/token`, {
    headers,
    method: 'POST',
    body: data,
  });
  
  if (response.ok) {
    return (await response.json()) as AccessToken;
  } else {
    throw new Error('Failed to exchange token');
  }
}

export async function refreshToken(refreshToken: string): Promise<AccessToken> {
  const data = {
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
  };
  const headers = {
    'Content-Type': 'application/x-www-form-urlencoded',
  };
  
  const response = await fetch(`${ API_ENDPOINT }/oauth2/token`, {
    headers,
    method: 'POST',
    body: new URLSearchParams(data),
  });
  
  if (response.ok) {
    return (await response.json()) as AccessToken;
  } else {
    throw new Error('Failed to refresh token');
  }
}

export async function revokeToken(accessToken: string) {
  const data = {
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    token: accessToken,
  };
  
  const headers = {
    'Content-Type': 'application/x-www-form-urlencoded',
  };
  
  const res = await fetch(`https://discord.com/api/oauth2/token/revoke`, {
    headers,
    body: new URLSearchParams(data),
    method: 'POST',
  });
  
  if (res.ok) {
    return (await res.json()) as AccessToken;
  } else {
    throw new Error('Failed to refresh token');
  }
}