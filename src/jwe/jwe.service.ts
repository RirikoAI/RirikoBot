import { Injectable } from '@nestjs/common';
import { JwksService } from '#jwks/jwks.service';
import * as jose from 'jose';

@Injectable()
export class JweService {
  constructor(private readonly jwksService: JwksService) {}

  async encrypt(data: object | string): Promise<string> {
    // get the keys from the jwksService
    // use the public key to encrypt the data
    const publicKey = await jose.importJWK(
      this.jwksService.keys.encryptionPublicJwk,
    );

    // if data is an object, stringify it
    if (typeof data === 'object') {
      data = JSON.stringify(data);
    }

    // encrypt using jose
    const jwe = await new jose.CompactEncrypt(new TextEncoder().encode(data))
      .setProtectedHeader({ alg: 'RSA-OAEP-256', enc: 'A256GCM' })
      .encrypt(publicKey);

    return jwe;
  }

  async decrypt(jwe: string): Promise<any> {
    // get the keys from the jwksService
    // use the private key to decrypt the data
    const privateKey = await jose.importJWK(
      this.jwksService.keys.encryptionPrivateJwk,
    );

    // decrypt using jose
    const { plaintext } = await jose.compactDecrypt(jwe, privateKey);

    return JSON.parse(new TextDecoder().decode(plaintext));
  }
}
