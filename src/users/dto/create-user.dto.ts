import { Transform } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, MinLength, Validate } from 'class-validator';
import { IsNotExist } from '#util/validators/is-not-exists.validator';
import { IsExist } from '#util/validators/is-exists.validator';
import { lowerCaseTransformer } from '#util/transformers/lower-case.transformer';
import { Role } from '#database/entities/role.entity';
import { Status } from '#database/entities/status.entity';

export class CreateUserDto {
  @ApiProperty({ example: 'test1@example.com' })
  @Transform(lowerCaseTransformer)
  @IsNotEmpty()
  @Validate(IsNotExist, ['User'], {
    message: 'emailAlreadyExists',
  })
  @IsEmail()
  email: string | null;

  id?: string;

  username?: string;

  displayName?: string;

  @ApiProperty()
  @MinLength(6)
  password?: string;

  provider?: string;

  socialId?: string | null;

  @ApiProperty({ example: 'John' })
  @IsNotEmpty()
  firstName: string | null;

  @ApiProperty({ example: 'Doe' })
  @IsNotEmpty()
  lastName: string | null;

  @ApiProperty({ type: Role })
  @Validate(IsExist, ['Role', 'id'], {
    message: 'roleNotExists',
  })
  role?: Role | null;

  @ApiProperty({ type: Status })
  @Validate(IsExist, ['Status', 'id'], {
    message: 'statusNotExists',
  })
  status?: Status;

  hash?: string | null;
}
