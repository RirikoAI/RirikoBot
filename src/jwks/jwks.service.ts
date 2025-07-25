import { Injectable, Logger } from '@nestjs/common';
import * as jose from 'jose';
import * as crypto from 'crypto';

type Keys = {
  signingPublicJwk?: any;
  signingPrivateJwk?: any;
  encryptionPublicJwk?: any;
  encryptionPrivateJwk?: any;
};

// store the keys in memory
const keys: Keys = {};

@Injectable()
export class JwksService {
  async generateJwks() {
    Logger.log('Generating JWKS', 'Ririko JWKS Service');
    const { publicKey: signingPublicKey, privateKey: signingPrivateKey } =
      await jose.generateKeyPair('RS256');

    const { publicKey: encryptionPublicKey, privateKey: encryptionPrivateKey } =
      await jose.generateKeyPair('RSA-OAEP');

    // Export the keys in JWK (JSON Web Key) format
    const signingPublicJwk = await jose.exportJWK(signingPublicKey);
    const signingPrivateJwk = await jose.exportJWK(signingPrivateKey);
    const encryptionPublicJwk = await jose.exportJWK(encryptionPublicKey);
    const encryptionPrivateJwk = await jose.exportJWK(encryptionPrivateKey);

    signingPublicJwk.alg = 'RS256';
    signingPrivateJwk.alg = 'RS256';
    signingPublicJwk.use = 'sig';
    signingPublicJwk.kid = crypto.randomUUID();
    encryptionPublicJwk.alg = 'RSA-OAEP';
    encryptionPrivateJwk.alg = 'RSA-OAEP';
    encryptionPublicJwk.use = 'enc';
    encryptionPublicJwk.kid = crypto.randomUUID();

    // Store the keys in memory
    keys.signingPublicJwk = signingPublicJwk;
    keys.signingPrivateJwk = signingPrivateJwk;

    keys.encryptionPublicJwk = encryptionPublicJwk;
    keys.encryptionPrivateJwk = encryptionPrivateJwk;

    // Return or store the keys as needed
    return {
      signingPublicJwk,
      encryptionPublicJwk,
    };
  }

  get publicJwks() {
    return {
      signingPublicJwk: keys.signingPublicJwk,
      encryptionPublicJwk: keys.encryptionPublicJwk,
    };
  }

  get keys() {
    return keys;
  }
}
