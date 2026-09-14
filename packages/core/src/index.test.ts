import { describe, expect, it } from 'vitest';
import { CORE_VERSION } from './index.js';

describe('Core Module', () => {
  it('should export valid semantic version', () => {
    expect(CORE_VERSION).toBe('2.0.0');
  });
});
