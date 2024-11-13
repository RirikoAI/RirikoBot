// src/util/config/config-validator.util.spec.ts
import ConfigValidatorUtil from './config-validator.util';
import { IsString, IsNumber } from 'class-validator';
import 'reflect-metadata';

class EnvVariables {
  @IsString()
  DATABASE_HOST: string;

  @IsNumber()
  DATABASE_PORT: number;
}

describe('ConfigValidatorUtil', () => {
  it('should validate and return the config object when valid', () => {
    const config = {
      DATABASE_HOST: 'localhost',
      DATABASE_PORT: 5432,
    };

    const validatedConfig = ConfigValidatorUtil.validate(config, EnvVariables);

    expect(validatedConfig).toEqual(config);
  });

  it('should throw an error when config object is invalid', () => {
    const config = {
      DATABASE_HOST: 'localhost',
      DATABASE_PORT: 'invalid_port',
    };

    expect(() => {
      ConfigValidatorUtil.validate(config, EnvVariables);
    }).toThrowError();
  });
});
