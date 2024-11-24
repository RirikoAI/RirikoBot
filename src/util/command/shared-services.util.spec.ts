import { SharedServiceUtil } from '#util/command/shared-service.util';

describe('SharedServiceUtil', () => {
  class MockService {
    get propertyOne() {
      return 'valueOne';
    }
  }

  describe('getFactory', () => {
    it('should return an object with provide, inject, and useFactory properties', () => {
      const sharedServiceIdentifier = 'MockService';
      const factory = SharedServiceUtil.getFactory(
        sharedServiceIdentifier,
        MockService,
      );

      expect(factory).toHaveProperty('provide', sharedServiceIdentifier);
      expect(factory).toHaveProperty('inject');
      expect(factory).toHaveProperty('useFactory');
    });

    it('should handle empty services gracefully', () => {
      class EmptyService {}

      const factory = SharedServiceUtil.getFactory(
        'EmptyService',
        EmptyService,
      );

      expect(factory.inject).toEqual([]);

      const mockServices: any[] = [];
      const createdService = factory.useFactory(...mockServices);

      expect(createdService).toEqual({});
    });
  });
});
