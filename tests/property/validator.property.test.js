import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { validatePayload } from '../../src/validator.js';

/**
 * Feature: resilient-service-levels, Property 1: Validación de payload acepta válidos y rechaza inválidos
 *
 * Validates: Requirements 1.2, 1.3, 1.4
 *
 * For any JSON payload with fields `message` (string ≤1024 chars), `timestamp` (string ISO 8601)
 * and `error` (boolean), the validation function must return valid.
 * For any payload that doesn't meet these conditions, it must return invalid.
 */

// ISO 8601 regex used by the validator
const ISO_8601_REGEX = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;

// --- Generators ---

/**
 * Generator for valid ISO 8601 timestamps matching the validator's regex.
 */
const validTimestampArb = fc.tuple(
  fc.integer({ min: 2000, max: 2099 }), // year
  fc.integer({ min: 1, max: 12 }),       // month
  fc.integer({ min: 1, max: 28 }),       // day (safe range)
  fc.integer({ min: 0, max: 23 }),       // hour
  fc.integer({ min: 0, max: 59 }),       // minute
  fc.integer({ min: 0, max: 59 }),       // second
  fc.option(fc.integer({ min: 1, max: 999 }), { nil: undefined }), // optional milliseconds
  fc.oneof(
    fc.constant('Z'),
    fc.tuple(
      fc.constantFrom('+', '-'),
      fc.integer({ min: 0, max: 14 }),
      fc.integer({ min: 0, max: 59 })
    ).map(([sign, h, m]) => `${sign}${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`)
  )
).map(([year, month, day, hour, minute, second, ms, tz]) => {
  const base = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:${String(second).padStart(2, '0')}`;
  const msPart = ms !== undefined ? `.${String(ms).padStart(3, '0')}` : '';
  return `${base}${msPart}${tz}`;
});

/**
 * Generator for valid message strings (≤1024 characters).
 */
const validMessageArb = fc.string({ minLength: 0, maxLength: 1024 });

/**
 * Generator for valid payloads that should pass validation.
 */
const validPayloadArb = fc.tuple(
  validMessageArb,
  validTimestampArb,
  fc.boolean()
).map(([message, timestamp, error]) => ({
  message,
  timestamp,
  error,
}));

/**
 * Generator for invalid timestamps (strings that do NOT match ISO 8601 regex).
 */
const invalidTimestampArb = fc.oneof(
  fc.constant('2024/01/15'),
  fc.constant('not-a-date'),
  fc.constant('2024-01-15'),
  fc.constant('2024-01-15T10:05:30'),  // missing timezone
  fc.constant('15-01-2024T10:05:30Z'), // wrong order
  fc.string({ minLength: 1, maxLength: 30 }).filter(s => !ISO_8601_REGEX.test(s))
);

/**
 * Generator for messages that exceed 1024 characters.
 */
const tooLongMessageArb = fc.string({ minLength: 1025, maxLength: 2048 });

// --- Property Tests ---

describe('Feature: resilient-service-levels, Property 1: Validación de payload acepta válidos y rechaza inválidos', () => {

  it('valid payloads are accepted', () => {
    fc.assert(
      fc.property(validPayloadArb, (payload) => {
        const body = JSON.stringify(payload);
        const result = validatePayload(body);

        expect(result.valid).toBe(true);
        expect(result.data).toEqual({
          message: payload.message,
          timestamp: payload.timestamp,
          error: payload.error,
        });
      }),
      { numRuns: 100 }
    );
  });

  it('payloads with message exceeding 1024 chars are rejected', () => {
    fc.assert(
      fc.property(
        tooLongMessageArb,
        validTimestampArb,
        fc.boolean(),
        (message, timestamp, error) => {
          const body = JSON.stringify({ message, timestamp, error });
          const result = validatePayload(body);

          expect(result.valid).toBe(false);
          expect(result.error).toBe("Campo 'message' excede el máximo de 1024 caracteres");
        }
      ),
      { numRuns: 100 }
    );
  });

  it('payloads with invalid timestamp format are rejected', () => {
    fc.assert(
      fc.property(
        validMessageArb,
        invalidTimestampArb,
        fc.boolean(),
        (message, timestamp, error) => {
          const body = JSON.stringify({ message, timestamp, error });
          const result = validatePayload(body);

          expect(result.valid).toBe(false);
          expect(result.error).toBe("Campo 'timestamp' es inválido o está ausente");
        }
      ),
      { numRuns: 100 }
    );
  });

  it('payloads with non-boolean error field are rejected', () => {
    const nonBooleanArb = fc.oneof(
      fc.string(),
      fc.integer(),
      fc.float(),
      fc.constant(null),
      fc.constant(undefined),
      fc.array(fc.anything()),
      fc.dictionary(fc.string(), fc.anything())
    );

    fc.assert(
      fc.property(
        validMessageArb,
        validTimestampArb,
        nonBooleanArb,
        (message, timestamp, errorVal) => {
          const payload = { message, timestamp, error: errorVal };
          const body = JSON.stringify(payload);
          const result = validatePayload(body);

          expect(result.valid).toBe(false);
          expect(result.error).toBe("Campo 'error' es inválido o está ausente");
        }
      ),
      { numRuns: 100 }
    );
  });

  it('payloads with non-string message field are rejected', () => {
    const nonStringArb = fc.oneof(
      fc.integer(),
      fc.float(),
      fc.boolean(),
      fc.constant(null),
      fc.constant(undefined),
      fc.array(fc.anything()),
      fc.dictionary(fc.string(), fc.anything())
    );

    fc.assert(
      fc.property(
        nonStringArb,
        validTimestampArb,
        fc.boolean(),
        (messageVal, timestamp, error) => {
          const payload = { message: messageVal, timestamp, error };
          const body = JSON.stringify(payload);
          const result = validatePayload(body);

          expect(result.valid).toBe(false);
          expect(result.error).toBe("Campo 'message' es inválido o está ausente");
        }
      ),
      { numRuns: 100 }
    );
  });

  it('payloads with missing required fields are rejected', () => {
    // Generate payloads missing at least one required field
    const missingFieldArb = fc.oneof(
      // Missing message
      fc.tuple(validTimestampArb, fc.boolean()).map(([timestamp, error]) =>
        JSON.stringify({ timestamp, error })
      ),
      // Missing timestamp
      fc.tuple(validMessageArb, fc.boolean()).map(([message, error]) =>
        JSON.stringify({ message, error })
      ),
      // Missing error
      fc.tuple(validMessageArb, validTimestampArb).map(([message, timestamp]) =>
        JSON.stringify({ message, timestamp })
      ),
      // Empty object
      fc.constant(JSON.stringify({}))
    );

    fc.assert(
      fc.property(missingFieldArb, (body) => {
        const result = validatePayload(body);
        expect(result.valid).toBe(false);
        expect(result.error).toBeDefined();
        expect(typeof result.error).toBe('string');
      }),
      { numRuns: 100 }
    );
  });

  it('non-JSON bodies are rejected', () => {
    const nonJsonArb = fc.string().filter(s => {
      try { JSON.parse(s); return false; } catch { return true; }
    });

    fc.assert(
      fc.property(nonJsonArb, (body) => {
        const result = validatePayload(body);
        expect(result.valid).toBe(false);
        expect(result.error).toBe("El formato del body no es JSON válido");
      }),
      { numRuns: 100 }
    );
  });
});
