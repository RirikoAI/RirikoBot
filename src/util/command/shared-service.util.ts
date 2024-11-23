import { AvailableSharedServices } from '#command/command.module';

export const SharedServiceUtil = {
  getFactory: (sharedServiceIdentifier: string) => {
    const sharedServicesInstance = new AvailableSharedServices();

    return {
      provide: sharedServiceIdentifier,
      // Define the shared services to be injected
      inject: Object.getOwnPropertyNames(sharedServicesInstance).map(
        (key) => sharedServicesInstance[key],
      ),
      // Define the keys for the shared services in order of the inject array above
      useFactory: (...service): any => {
        let i = 0;
        let svc = {};
        Object.getOwnPropertyNames(sharedServicesInstance).forEach((key) => {
          svc[key] = service[i++];
        });
        return svc;
      },
    };
  },
};