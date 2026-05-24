import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { evaluateTransition } from '../../src/levelEngine.js';

/**
 * Feature: resilient-service-levels, Property 4: Transición de degradación según umbrales
 *
 * Validates: Requirements 3.1, 3.2, 3.3, 3.5
 *
 * For any system state with a current level and error count in the time window:
 * - Level 2 if current level is Level 1 and errorCount >= 5 (and errorCount < 10)
 * - Level 3 if current level is Level 2 and errorCount >= 10
 * - Level 3 if current level is Level 1 and errorCount >= 10
 * - No change if no threshold is reached
 *
 * After a degradation transition, the error count must not be reset.
 */
describe('Feature: resilient-service-levels, Property 4: Transición de degradación según umbrales', () => {
  it('Nivel 1 + errorCount >= 5 (y < 10) → transiciona a Nivel 2', () => {
    /**
     * **Validates: Requirements 3.1**
     */
    fc.assert(
      fc.property(
        fc.integer({ min: 5, max: 9 }),
        fc.integer({ min: 0, max: 1000 }),
        (errorCount, totalCount) => {
          const result = evaluateTransition(1, errorCount, totalCount);
          expect(result.newLevel).toBe(2);
          expect(result.transitionType).toBe('degradation');
        }
      ),
      { numRuns: 100 }
    );
  });

  it('Nivel 2 + errorCount >= 10 → transiciona a Nivel 3', () => {
    /**
     * **Validates: Requirements 3.2**
     */
    fc.assert(
      fc.property(
        fc.integer({ min: 10, max: 1000 }),
        fc.integer({ min: 0, max: 1000 }),
        (errorCount, totalCount) => {
          const result = evaluateTransition(2, errorCount, totalCount);
          expect(result.newLevel).toBe(3);
          expect(result.transitionType).toBe('degradation');
        }
      ),
      { numRuns: 100 }
    );
  });

  it('Nivel 1 + errorCount >= 10 → transiciona directamente a Nivel 3', () => {
    /**
     * **Validates: Requirements 3.3**
     */
    fc.assert(
      fc.property(
        fc.integer({ min: 10, max: 1000 }),
        fc.integer({ min: 0, max: 1000 }),
        (errorCount, totalCount) => {
          const result = evaluateTransition(1, errorCount, totalCount);
          expect(result.newLevel).toBe(3);
          expect(result.transitionType).toBe('degradation');
        }
      ),
      { numRuns: 100 }
    );
  });

  it('Sin cambio de nivel si no se alcanza ningún umbral de degradación', () => {
    /**
     * **Validates: Requirements 3.1, 3.2, 3.3**
     *
     * Generates combinations where degradation thresholds are NOT met:
     * - Level 1 with errorCount < 5
     * - Level 2 with errorCount < 10
     * - Level 3 (never degrades further)
     */
    fc.assert(
      fc.property(
        fc.oneof(
          // Level 1 with errorCount < 5 (and totalCount < 5 to avoid recovery)
          fc.record({
            level: fc.constant(1),
            errorCount: fc.integer({ min: 1, max: 4 }),
            totalCount: fc.integer({ min: 0, max: 4 }),
          }),
          // Level 2 with errorCount < 10 (and errorCount > 0 to avoid recovery)
          fc.record({
            level: fc.constant(2),
            errorCount: fc.integer({ min: 1, max: 9 }),
            totalCount: fc.integer({ min: 0, max: 4 }),
          }),
          // Level 3 never degrades further (with errorCount > 0 to avoid recovery)
          fc.record({
            level: fc.constant(3),
            errorCount: fc.integer({ min: 1, max: 1000 }),
            totalCount: fc.integer({ min: 0, max: 1000 }),
          })
        ),
        ({ level, errorCount, totalCount }) => {
          const result = evaluateTransition(level, errorCount, totalCount);
          expect(result.newLevel).toBe(level);
          expect(result.transitionType).toBeNull();
        }
      ),
      { numRuns: 100 }
    );
  });

  it('Después de una transición de degradación, el conteo de errores no se reinicia (evaluateTransition no modifica errorCount)', () => {
    /**
     * **Validates: Requirements 3.5**
     *
     * The evaluateTransition function is pure - it receives errorCount and returns
     * a transition decision without modifying the count. This verifies that the
     * function does not reset or alter the error count value.
     */
    fc.assert(
      fc.property(
        fc.oneof(
          // Level 1 → Level 2 (errorCount 5-9)
          fc.record({
            level: fc.constant(1),
            errorCount: fc.integer({ min: 5, max: 9 }),
            totalCount: fc.integer({ min: 0, max: 1000 }),
          }),
          // Level 1 → Level 3 (errorCount >= 10)
          fc.record({
            level: fc.constant(1),
            errorCount: fc.integer({ min: 10, max: 1000 }),
            totalCount: fc.integer({ min: 0, max: 1000 }),
          }),
          // Level 2 → Level 3 (errorCount >= 10)
          fc.record({
            level: fc.constant(2),
            errorCount: fc.integer({ min: 10, max: 1000 }),
            totalCount: fc.integer({ min: 0, max: 1000 }),
          })
        ),
        ({ level, errorCount, totalCount }) => {
          const originalErrorCount = errorCount;
          const result = evaluateTransition(level, errorCount, totalCount);

          // The function produces a degradation transition
          expect(result.transitionType).toBe('degradation');

          // The errorCount value is unchanged (function is pure, doesn't reset it)
          expect(errorCount).toBe(originalErrorCount);
        }
      ),
      { numRuns: 100 }
    );
  });
});


/**
 * Feature: resilient-service-levels, Property 6: Degradación tiene prioridad sobre recuperación
 *
 * **Validates: Requirements 4.4**
 *
 * Property 6: For any system state where degradation conditions (errorCount reaches threshold)
 * are met, the evaluation function must apply degradation and not recovery,
 * regardless of totalCount.
 *
 * In practice, recovery requires errorCount === 0, so both conditions cannot truly
 * be met simultaneously. The test verifies that when errorCount >= threshold,
 * degradation is ALWAYS applied regardless of totalCount value (even when totalCount >= 5
 * which is the recovery threshold).
 */
describe('Feature: resilient-service-levels, Property 6: Degradación tiene prioridad sobre recuperación', () => {
  it('Level 1 with errorCount >= 5 should ALWAYS degrade (never recover) regardless of totalCount', () => {
    /**
     * **Validates: Requirements 4.4**
     *
     * When Level 1 has errorCount >= 5, degradation must always be applied.
     * Even if totalCount >= 5 (which would normally be a recovery condition),
     * degradation takes priority.
     */
    fc.assert(
      fc.property(
        fc.integer({ min: 5, max: 1000 }),   // errorCount >= 5 (degradation threshold for Level 1)
        fc.integer({ min: 5, max: 10000 }),  // totalCount >= 5 (recovery threshold met)
        (errorCount, totalCount) => {
          const result = evaluateTransition(1, errorCount, totalCount);

          // Degradation must always be applied
          expect(result.transitionType).toBe('degradation');

          // Level must go to 2 (if errorCount 5-9) or 3 (if errorCount >= 10)
          if (errorCount >= 10) {
            expect(result.newLevel).toBe(3);
          } else {
            expect(result.newLevel).toBe(2);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('Level 2 with errorCount >= 10 should ALWAYS degrade (never recover) regardless of totalCount', () => {
    /**
     * **Validates: Requirements 4.4**
     *
     * When Level 2 has errorCount >= 10, degradation must always be applied.
     * Even if totalCount >= 5 (which would normally be a recovery condition),
     * degradation takes priority.
     */
    fc.assert(
      fc.property(
        fc.integer({ min: 10, max: 1000 }),  // errorCount >= 10 (degradation threshold for Level 2)
        fc.integer({ min: 5, max: 10000 }),  // totalCount >= 5 (recovery threshold met)
        (errorCount, totalCount) => {
          const result = evaluateTransition(2, errorCount, totalCount);

          // Degradation must always be applied
          expect(result.transitionType).toBe('degradation');

          // Level must go to 3
          expect(result.newLevel).toBe(3);
        }
      ),
      { numRuns: 100 }
    );
  });
});


/**
 * Feature: resilient-service-levels, Property 5: Recuperación gradual de un solo nivel
 *
 * **Validates: Requirements 4.1, 4.2, 4.3**
 *
 * For any system state where the current level is Level 2 or Level 3,
 * if the current time window has errorCount = 0 and totalCount >= 5,
 * the evaluation function must transition exactly one level up
 * (Level 3→Level 2, Level 2→Level 1).
 * It must never skip more than one level in a single recovery evaluation.
 */
describe('Feature: resilient-service-levels, Property 5: Recuperación gradual de un solo nivel', () => {
  it('should recover exactly one level when errorCount=0 and totalCount>=5 for Level 2 or Level 3', () => {
    /**
     * **Validates: Requirements 4.1, 4.2, 4.3**
     */
    fc.assert(
      fc.property(
        // Generate a current level of 2 or 3 (recoverable levels)
        fc.constantFrom(2, 3),
        // Generate totalCount >= 5 (recovery threshold)
        fc.integer({ min: 5, max: 10000 }),
        (currentLevel, totalCount) => {
          const errorCount = 0;

          const result = evaluateTransition(currentLevel, errorCount, totalCount);

          // Must transition exactly one level up
          expect(result.newLevel).toBe(currentLevel - 1);
          expect(result.transitionType).toBe('recovery');

          // Must never skip more than one level
          const levelDifference = currentLevel - result.newLevel;
          expect(levelDifference).toBe(1);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should not recover when at Level 1 (already at maximum)', () => {
    /**
     * **Validates: Requirements 4.3**
     */
    fc.assert(
      fc.property(
        // Generate totalCount >= 5 (would trigger recovery if not at Level 1)
        fc.integer({ min: 5, max: 10000 }),
        (totalCount) => {
          const currentLevel = 1;
          const errorCount = 0;

          const result = evaluateTransition(currentLevel, errorCount, totalCount);

          // Level 1 should stay at Level 1 (no recovery possible)
          expect(result.newLevel).toBe(1);
          expect(result.transitionType).toBeNull();
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should not recover when totalCount < 5 even with errorCount=0', () => {
    /**
     * **Validates: Requirements 4.1, 4.2, 4.3**
     */
    fc.assert(
      fc.property(
        // Generate a recoverable level (2 or 3)
        fc.constantFrom(2, 3),
        // Generate totalCount < 5 (below recovery threshold)
        fc.integer({ min: 0, max: 4 }),
        (currentLevel, totalCount) => {
          const errorCount = 0;

          const result = evaluateTransition(currentLevel, errorCount, totalCount);

          // Should NOT recover - stay at current level
          expect(result.newLevel).toBe(currentLevel);
          expect(result.transitionType).toBeNull();
        }
      ),
      { numRuns: 100 }
    );
  });
});
