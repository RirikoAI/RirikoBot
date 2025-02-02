import * as CryptoJS from 'crypto-js';

export function encrypt(token: string) {
  return CryptoJS.AES.encrypt(token, process.env.AUTH_JWT_SECRET);
}

export function decrypt(token: string) {
  return CryptoJS.AES.decrypt(token, process.env.AUTH_REFRESH_SECRET);
}
