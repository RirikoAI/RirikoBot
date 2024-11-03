import { plainToClass } from 'class-transformer';
import { validateSync } from 'class-validator';
import { ClassConstructor } from 'class-transformer/types/interfaces';

const ConfigValidatorUtil = {
  validate: <T extends object>(
    config: Record<string, unknown>,
    envVariablesClass: ClassConstructor<T>,
  ): T => {
    const validatedConfig = plainToClass(envVariablesClass, config, {
      enableImplicitConversion: true,
    });
    const errors = validateSync(validatedConfig, {
      skipMissingProperties: false,
    });
    
    if (errors.length > 0) {
      throw new Error(errors.toString());
    }
    return validatedConfig;
  }
}

export default ConfigValidatorUtil;