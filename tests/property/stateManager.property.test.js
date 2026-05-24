import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { getWindowKey } from '../../src/stateManager.js';

/**
 * Feature: resilient-service-levels, Property 2: Cálculo de clave de ventana temporal es truncamiento al minuto
 * Validates: Requirements 2.2
 */
describe('Feature: resilient-service-levels, Property 2: Cálculo de clave de ventana temporal es truncamiento al minuto', () => {
  it('two timestamps in the same minute produce the same window key', () => {
    fc.assert(
      fc.property(
        // Generate a base date, then two random seconds/milliseconds within the same minute
        fc.date({ min: new Date('2000-01-01T00:00:00.000Z'), max: new Date('2099-12-31T23:59:59.999Z') }),
        fc.integer({ min: 0, max: 59 }),
        fc.integer({ min: 0, max: 999 }),
        fc.integer({ min: 0, max: 59 }),
        fc.integer({ min: 0, max: 999 }),
        (baseDate, seconds1, millis1, seconds2, millis2) => {
          // Create two timestamps in the same minute but with different seconds/milliseconds
          const date1 = new Date(baseDate);
          date1.setUTCSeconds(seconds1, millis1);

          const date2 = new Date(baseDate);
          date2.setUTCSeconds(seconds2, millis2);

          const key1 = getWindowKey(date1.toISOString());
          const key2 = getWindowKey(date2.toISOString());

          expect(key1).toBe(key2);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('timestamps in different minutes produce different window keys', () => {
    fc.assert(
      fc.property(
        // Generate two dates that are guaranteed to be in different minutes
        fc.date({ min: new Date('2000-01-01T00:00:00.000Z'), max: new Date('2099-12-31T23:58:59.999Z') }),
        fc.integer({ min: 1, max: 525600 }), // offset in minutes (1 min to ~1 year)
        (baseDate, minuteOffset) => {
          const date1 = new Date(baseDate);
          // Zero out seconds/millis for clarity
          date1.setUTCSeconds(0, 0);

          const date2 = new Date(date1.getTime() + minuteOffset * 60000);

          const key1 = getWindowKey(date1.toISOString());
          const key2 = getWindowKey(date2.toISOString());

          expect(key1).not.toBe(key2);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('window key corresponds to the timestamp truncated to the minute (seconds and milliseconds removed)', () => {
    fc.assert(
      fc.property(
        fc.date({ min: new Date('2000-01-01T00:00:00.000Z'), max: new Date('2099-12-31T23:59:59.999Z') }),
        (date) => {
          const timestamp = date.toISOString();
          const key = getWindowKey(timestamp);

          // The key should be WINDOW# + the first 16 characters of the ISO string (YYYY-MM-DDTHH:MM)
          const expectedPrefix = 'WINDOW#';
          const expectedTruncated = date.toISOString().slice(0, 16);

          expect(key).toBe(`${expectedPrefix}${expectedTruncated}`);
          // Verify no seconds or milliseconds in the key
          expect(key.length).toBe(expectedPrefix.length + 16);
        }
      ),
      { numRuns: 100 }
    );
  });
});
