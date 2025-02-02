import {
  FindOAuth2Params,
  FindUserParams,
  OAuth2Details,
  UserDetails,
} from '#util/types/auth.type';
import { User } from '#database/entities/user.entity';

export interface AuthServiceInterface {
  validateDiscordUser(datails: UserDetails): Promise<any>;

  createUser(details: UserDetails): Promise<User>;

  updateUser(details: UserDetails): Promise<User>;

  findUser(params: FindUserParams): Promise<User>;

  validateOAuth2(details: OAuth2Details): Promise<OAuth2Details>;

  createOAuth2(details: OAuth2Details): Promise<OAuth2Details>;

  updateOAuth2(details: OAuth2Details): Promise<OAuth2Details>;

  findOAuth2(params: FindOAuth2Params): Promise<OAuth2Details>;
}
