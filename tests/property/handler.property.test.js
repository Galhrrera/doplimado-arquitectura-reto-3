import { describe, it, expect, vi, beforeEach } from 'vitest';
import fc from 'fast-check';

// Mock all dependencies
vi.mock('../../src/validator.js', () => ({
  validatePayload: vi.fn(),
}));

vi.mock('../../src/stateManager.js', () => ({
  getCurrentLevel: vi.fn(),
  setLevel: vi.fn(),
  initializeLevel: vi.fn(),
  incrementCounters: vi.fn(),
  getWindowCounters: vi.fn(),
  getWindowKey: vi.fn(),
}));

vi.mock('../../src/levelEngine.js', () => ({
  evaluateTransition: vi.fn(),
}));

vi.mock('../../src/logger.js', () => ({
  logRequest: vi.fn(),
  logTransition: vi.fn(),
  emitLevelMetric: vi.fn(),
}));

import { handler } from '../../src/handler.js';
import { validatePayload } from '../../src/validator.js';
import { getCurrentLevel, incrementCounters, getWindowCounters, getWindowKey } from '../../src/stateManager.js';
import { evaluateTransition } from '../../src/levelEngine.js';

const LEVEL_MESSAGES = {
  1: 'Nivel 1: Operación completa, todas las capacidades activas',
  2: 'Nivel 2: Operación degradada, funcionalidades esenciales disponibles',
  3: 'Nivel 3: Operación al mínimo',
};

/**
 * Feature: resilient-service-levels, Property 7: Respuesta correcta según nivel de servicio
 *
 * **Validates: Requirements 5.1, 5.2, 5.3, 5.5**
 *
 * For any valid service level (1, 2, or 3), the response generation function must produce
 * an object with HTTP code 200, the corresponding text message for the level, and a `level`
 * field with the numeric value of the current level.
 */
describe('Feature: resilient-service-levels, Property 7: Respuesta correcta según nivel de servicio', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return statusCode 200, correct message, and correct level field for any valid service level', async () => {
    /**
     * **Validates: Requirements 5.1, 5.2, 5.3, 5.5**
     */
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(1, 2, 3),
        async (level) => {
          // Mock dependencies for a normal flow where the system operates at the generated level
          validatePayload.mockReturnValue({
            valid: true,
            data: { message: 'test', timestamp: '2024-01-15T10:05:30Z', error: false },
          });
          getCurrentLevel.mockResolvedValue(level);
          getWindowKey.mockReturnValue('WINDOW#2024-01-15T10:05');
          incrementCounters.mockResolvedValue(undefined);
          getWindowCounters.mockResolvedValue({ errorCount: 0, totalCount: 1 });
          evaluateTransition.mockReturnValue({ newLevel: level, transitionType: null });

          const event = { body: '{}' };
          const result = await handler(event);

          // Verify statusCode is 200
          expect(result.statusCode).toBe(200);

          // Parse the response body
          const body = JSON.parse(result.body);

          // Verify the message corresponds to the correct level
          expect(body.message).toBe(LEVEL_MESSAGES[level]);

          // Verify the level field is present and correct
          expect(body.level).toBe(level);
        }
      ),
      { numRuns: 100 }
    );
  });
});
