import { User } from '#database/entities/user.entity';
import { Session } from '#database/entities/session.entity';

export type JwtPayloadType = Pick<User, 'id' | 'role'> & {
  sessionId: Session['id'];
  iat: number;
  exp: number;
};
