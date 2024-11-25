export const SharedServiceUtil = {
  getFactory: (sharedServiceIdentifier: string, sharedServices: any) => {
    const sharedServicesInstance = new sharedServices();

    return {
      provide: sharedServiceIdentifier,
      // Define the shared services to be injected
      inject: Object.getOwnPropertyNames(sharedServicesInstance).map(
        (key) => sharedServicesInstance[key],
      ),
      // Define the keys for the shared services in order of the inject array above
      useFactory: (...service): any => {
        let i = 0;
        const svc = {};
        Object.getOwnPropertyNames(sharedServicesInstance).forEach((key) => {
          svc[key] = service[i++];
        });
        return svc;
      },
    };
  },
};
