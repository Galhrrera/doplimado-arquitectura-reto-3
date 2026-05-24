import { describe, it, expect } from 'vitest';
import { validatePayload } from '../../src/validator.js';

describe('validatePayload', () => {
  describe('JSON parsing', () => {
    it('should reject non-JSON body', () => {
      const result = validatePayload('not json');
      expect(result).toEqual({ valid: false, error: "El formato del body no es JSON válido" });
    });

    it('should reject empty string', () => {
      const result = validatePayload('');
      expect(result).toEqual({ valid: false, error: "El formato del body no es JSON válido" });
    });

    it('should reject undefined body', () => {
      const result = validatePayload(undefined);
      expect(result).toEqual({ valid: false, error: "El formato del body no es JSON válido" });
    });
  });

  describe('campo message', () => {
    it('should reject payload without message field', () => {
      const body = JSON.stringify({ timestamp: '2024-01-15T10:05:30Z', error: false });
      const result = validatePayload(body);
      expect(result).toEqual({ valid: false, error: "Campo 'message' es inválido o está ausente" });
    });

    it('should reject payload with non-string message', () => {
      const body = JSON.stringify({ message: 123, timestamp: '2024-01-15T10:05:30Z', error: false });
      const result = validatePayload(body);
      expect(result).toEqual({ valid: false, error: "Campo 'message' es inválido o está ausente" });
    });

    it('should reject message exceeding 1024 characters', () => {
      const body = JSON.stringify({ message: 'a'.repeat(1025), timestamp: '2024-01-15T10:05:30Z', error: false });
      const result = validatePayload(body);
      expect(result).toEqual({ valid: false, error: "Campo 'message' excede el máximo de 1024 caracteres" });
    });

    it('should accept message with exactly 1024 characters', () => {
      const body = JSON.stringify({ message: 'a'.repeat(1024), timestamp: '2024-01-15T10:05:30Z', error: false });
      const result = validatePayload(body);
      expect(result.valid).toBe(true);
    });

    it('should accept empty string message', () => {
      const body = JSON.stringify({ message: '', timestamp: '2024-01-15T10:05:30Z', error: false });
      const result = validatePayload(body);
      expect(result.valid).toBe(true);
    });
  });

  describe('campo timestamp', () => {
    it('should reject payload without timestamp field', () => {
      const body = JSON.stringify({ message: 'hello', error: false });
      const result = validatePayload(body);
      expect(result).toEqual({ valid: false, error: "Campo 'timestamp' es inválido o está ausente" });
    });

    it('should reject non-ISO 8601 timestamp', () => {
      const body = JSON.stringify({ message: 'hello', timestamp: '2024/01/15', error: false });
      const result = validatePayload(body);
      expect(result).toEqual({ valid: false, error: "Campo 'timestamp' es inválido o está ausente" });
    });

    it('should reject non-string timestamp', () => {
      const body = JSON.stringify({ message: 'hello', timestamp: 12345, error: false });
      const result = validatePayload(body);
      expect(result).toEqual({ valid: false, error: "Campo 'timestamp' es inválido o está ausente" });
    });

    it('should accept valid ISO 8601 timestamp with Z', () => {
      const body = JSON.stringify({ message: 'hello', timestamp: '2024-01-15T10:05:30Z', error: false });
      const result = validatePayload(body);
      expect(result.valid).toBe(true);
    });

    it('should accept valid ISO 8601 timestamp with milliseconds', () => {
      const body = JSON.stringify({ message: 'hello', timestamp: '2024-01-15T10:05:30.123Z', error: false });
      const result = validatePayload(body);
      expect(result.valid).toBe(true);
    });

    it('should accept valid ISO 8601 timestamp with timezone offset', () => {
      const body = JSON.stringify({ message: 'hello', timestamp: '2024-01-15T10:05:30+05:00', error: false });
      const result = validatePayload(body);
      expect(result.valid).toBe(true);
    });
  });

  describe('campo error', () => {
    it('should reject payload without error field', () => {
      const body = JSON.stringify({ message: 'hello', timestamp: '2024-01-15T10:05:30Z' });
      const result = validatePayload(body);
      expect(result).toEqual({ valid: false, error: "Campo 'error' es inválido o está ausente" });
    });

    it('should reject non-boolean error field (string "true")', () => {
      const body = JSON.stringify({ message: 'hello', timestamp: '2024-01-15T10:05:30Z', error: 'true' });
      const result = validatePayload(body);
      expect(result).toEqual({ valid: false, error: "Campo 'error' es inválido o está ausente" });
    });

    it('should reject non-boolean error field (number 1)', () => {
      const body = JSON.stringify({ message: 'hello', timestamp: '2024-01-15T10:05:30Z', error: 1 });
      const result = validatePayload(body);
      expect(result).toEqual({ valid: false, error: "Campo 'error' es inválido o está ausente" });
    });

    it('should accept error=true', () => {
      const body = JSON.stringify({ message: 'hello', timestamp: '2024-01-15T10:05:30Z', error: true });
      const result = validatePayload(body);
      expect(result.valid).toBe(true);
    });

    it('should accept error=false', () => {
      const body = JSON.stringify({ message: 'hello', timestamp: '2024-01-15T10:05:30Z', error: false });
      const result = validatePayload(body);
      expect(result.valid).toBe(true);
    });
  });

  describe('payload válido', () => {
    it('should return valid with extracted data', () => {
      const body = JSON.stringify({ message: 'test msg', timestamp: '2024-01-15T10:05:30Z', error: true });
      const result = validatePayload(body);
      expect(result).toEqual({
        valid: true,
        data: { message: 'test msg', timestamp: '2024-01-15T10:05:30Z', error: true },
      });
    });

    it('should ignore extra fields in payload', () => {
      const body = JSON.stringify({ message: 'hello', timestamp: '2024-01-15T10:05:30Z', error: false, extra: 'field' });
      const result = validatePayload(body);
      expect(result.valid).toBe(true);
      expect(result.data).toEqual({ message: 'hello', timestamp: '2024-01-15T10:05:30Z', error: false });
    });
  });
});
