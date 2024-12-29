import { SharedServiceUtil } from '#util/command/shared-service.util';

jest.mock('fs');
jest.mock('path');
jest.mock('@nestjs/config');
jest.mock('#discord/discord.client');
jest.mock('#command/command.class');

describe('CommandsLoaderUtil', () => {
  describe('getFactory', () => {
    it('should create a factory with the correct services', () => {
      class MockService {
        serviceA = 'Service A';
        serviceB = 'Service B';
      }

      const factory = SharedServiceUtil.getFactory('MockService', MockService);

      expect(factory.provide).toBe('MockService');
      expect(factory.inject).toEqual(['Service A', 'Service B']);

      const createdServices = factory.useFactory(
        'Service A Instance',
        'Service B Instance',
      );
      expect(createdServices).toEqual({
        serviceA: 'Service A Instance',
        serviceB: 'Service B Instance',
      });
    });
  });
});
