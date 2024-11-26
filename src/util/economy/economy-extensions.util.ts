export const EconomyExtensionsUtil = {
  getFactory: (identifier: string, extensions: any) => {
    const extensionsInstance = new extensions();

    // foreach extensionsInstance keys, instanciate the class
    Object.keys(extensionsInstance).forEach((key) => {
      extensionsInstance[key] = new extensionsInstance[key]();
    });

    return {
      provide: identifier,
      useValue: extensionsInstance,
    };
  },
};
