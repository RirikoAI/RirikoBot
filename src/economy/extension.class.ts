import { EconomyServices } from '#economy/economy.module';

export class EconomyExtension extends Wrapper<EconomyServices>() {
  constructor(init: EconomyServices) {
    super(init);
  }
}

function Wrapper<T extends object>(): new (init: T) => T {
  return class {
    constructor(init: T) {
      Object.assign(this, init);
    }
  } as any;
}
