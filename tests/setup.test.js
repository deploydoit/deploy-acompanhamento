import { describe, it, expect } from 'vitest';
import fc from 'fast-check';

describe('Testing framework setup', () => {
  it('should run a basic Vitest assertion', () => {
    expect(1 + 1).toBe(2);
  });

  it('should run a fast-check property test', () => {
    fc.assert(
      fc.property(fc.integer(), fc.integer(), (a, b) => {
        // Commutativity of addition
        expect(a + b).toBe(b + a);
      }),
      { numRuns: 100 }
    );
  });

  it('should support ES module imports', async () => {
    // Verify that ES module resolution works
    expect(typeof describe).toBe('function');
    expect(typeof fc.property).toBe('function');
  });
});
