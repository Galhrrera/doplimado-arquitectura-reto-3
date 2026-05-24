import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handler } from '../../src/handler.js';

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

import { validatePayload } from '../../src/validator.js';
import { getCurrentLevel, setLevel, initializeLevel, incrementCounters, getWindowCounters, getWindowKey } from '../../src/stateManager.js';
import { evaluateTransition } from '../../src/levelEngine.js';
import { logRequest, logTransition, emitLevelMetric } from '../../src/logger.js';

describe('handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Validation errors (400)', () => {
    it('should return 400 when payload is invalid', async () => {
      validatePayload.mockReturnValue({ valid: false, error: "El formato del body no es JSON válido" });

      const event = { body: 'not json' };
      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.message).toBe("El formato del body no es JSON válido");
      expect(body.level).toBeNull();
    });
  });

  describe('Initialization', () => {
    it('should initialize level to 1 when no level exists', async () => {
      validatePayload.mockReturnValue({ valid: true, data: { message: 'test', timestamp: '2024-01-15T10:05:30Z', error: false } });
      getCurrentLevel.mockResolvedValue(null);
      initializeLevel.mockResolvedValue(true);
      getWindowKey.mockReturnValue('WINDOW#2024-01-15T10:05');
      incrementCounters.mockResolvedValue(undefined);
      getWindowCounters.mockResolvedValue({ errorCount: 0, totalCount: 1 });
      evaluateTransition.mockReturnValue({ newLevel: 1, transitionType: null });

      const event = { body: '{}' };
      const result = await handler(event);

      expect(initializeLevel).toHaveBeenCalled();
      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.level).toBe(1);
    });

    it('should return 500 when DynamoDB fails during initialization (getCurrentLevel throws)', async () => {
      validatePayload.mockReturnValue({ valid: true, data: { message: 'test', timestamp: '2024-01-15T10:05:30Z', error: false } });
      getCurrentLevel.mockRejectedValue(new Error('DynamoDB unavailable'));

      const event = { body: '{}' };
      const result = await handler(event);

      expect(result.statusCode).toBe(500);
      const body = JSON.parse(result.body);
      expect(body.message).toBe('Servicio no disponible temporalmente');
      expect(body.level).toBeNull();
    });

    it('should return 500 when DynamoDB fails during initializeLevel', async () => {
      validatePayload.mockReturnValue({ valid: true, data: { message: 'test', timestamp: '2024-01-15T10:05:30Z', error: false } });
      getCurrentLevel.mockResolvedValue(null);
      initializeLevel.mockRejectedValue(new Error('DynamoDB unavailable'));

      const event = { body: '{}' };
      const result = await handler(event);

      expect(result.statusCode).toBe(500);
      const body = JSON.parse(result.body);
      expect(body.message).toBe('Servicio no disponible temporalmente');
      expect(body.level).toBeNull();
    });
  });

  describe('Normal flow - Level 1', () => {
    it('should return Level 1 message when operating at Level 1 with no transition', async () => {
      validatePayload.mockReturnValue({ valid: true, data: { message: 'test', timestamp: '2024-01-15T10:05:30Z', error: false } });
      getCurrentLevel.mockResolvedValue(1);
      getWindowKey.mockReturnValue('WINDOW#2024-01-15T10:05');
      incrementCounters.mockResolvedValue(undefined);
      getWindowCounters.mockResolvedValue({ errorCount: 0, totalCount: 3 });
      evaluateTransition.mockReturnValue({ newLevel: 1, transitionType: null });

      const event = { body: '{}' };
      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.message).toBe('Nivel 1: Operación completa, todas las capacidades activas');
      expect(body.level).toBe(1);
      expect(logRequest).toHaveBeenCalledWith(1, false, '2024-01-15T10:05:30Z', 0);
    });
  });

  describe('Normal flow - Level 2', () => {
    it('should return Level 2 message when operating at Level 2', async () => {
      validatePayload.mockReturnValue({ valid: true, data: { message: 'test', timestamp: '2024-01-15T10:05:30Z', error: false } });
      getCurrentLevel.mockResolvedValue(2);
      getWindowKey.mockReturnValue('WINDOW#2024-01-15T10:05');
      incrementCounters.mockResolvedValue(undefined);
      getWindowCounters.mockResolvedValue({ errorCount: 5, totalCount: 8 });
      evaluateTransition.mockReturnValue({ newLevel: 2, transitionType: null });

      const event = { body: '{}' };
      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.message).toBe('Nivel 2: Operación degradada, funcionalidades esenciales disponibles');
      expect(body.level).toBe(2);
    });
  });

  describe('Normal flow - Level 3', () => {
    it('should return Level 3 message when operating at Level 3', async () => {
      validatePayload.mockReturnValue({ valid: true, data: { message: 'test', timestamp: '2024-01-15T10:05:30Z', error: false } });
      getCurrentLevel.mockResolvedValue(3);
      getWindowKey.mockReturnValue('WINDOW#2024-01-15T10:05');
      incrementCounters.mockResolvedValue(undefined);
      getWindowCounters.mockResolvedValue({ errorCount: 10, totalCount: 15 });
      evaluateTransition.mockReturnValue({ newLevel: 3, transitionType: null });

      const event = { body: '{}' };
      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.message).toBe('Nivel 3: Operación al mínimo');
      expect(body.level).toBe(3);
    });
  });

  describe('Transitions', () => {
    it('should persist level, emit metric, and log transition on degradation', async () => {
      validatePayload.mockReturnValue({ valid: true, data: { message: 'test', timestamp: '2024-01-15T10:05:30Z', error: true } });
      getCurrentLevel.mockResolvedValue(1);
      getWindowKey.mockReturnValue('WINDOW#2024-01-15T10:05');
      incrementCounters.mockResolvedValue(undefined);
      getWindowCounters.mockResolvedValue({ errorCount: 5, totalCount: 5 });
      evaluateTransition.mockReturnValue({ newLevel: 2, transitionType: 'degradation' });
      setLevel.mockResolvedValue(undefined);
      emitLevelMetric.mockResolvedValue(undefined);

      const event = { body: '{}' };
      const result = await handler(event);

      expect(setLevel).toHaveBeenCalledWith(2);
      expect(emitLevelMetric).toHaveBeenCalledWith(2);
      expect(logTransition).toHaveBeenCalledWith(1, 2, 'degradation', '2024-01-15T10:05:30Z', 5);
      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.message).toBe('Nivel 2: Operación degradada, funcionalidades esenciales disponibles');
      expect(body.level).toBe(2);
    });

    it('should log transition with totalCount on recovery', async () => {
      validatePayload.mockReturnValue({ valid: true, data: { message: 'test', timestamp: '2024-01-15T10:05:30Z', error: false } });
      getCurrentLevel.mockResolvedValue(3);
      getWindowKey.mockReturnValue('WINDOW#2024-01-15T10:05');
      incrementCounters.mockResolvedValue(undefined);
      getWindowCounters.mockResolvedValue({ errorCount: 0, totalCount: 5 });
      evaluateTransition.mockReturnValue({ newLevel: 2, transitionType: 'recovery' });
      setLevel.mockResolvedValue(undefined);
      emitLevelMetric.mockResolvedValue(undefined);

      const event = { body: '{}' };
      const result = await handler(event);

      expect(setLevel).toHaveBeenCalledWith(2);
      expect(emitLevelMetric).toHaveBeenCalledWith(2);
      expect(logTransition).toHaveBeenCalledWith(3, 2, 'recovery', '2024-01-15T10:05:30Z', 5);
      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.message).toBe('Nivel 2: Operación degradada, funcionalidades esenciales disponibles');
      expect(body.level).toBe(2);
    });
  });

  describe('DynamoDB errors after initialization', () => {
    it('should return 503 when DynamoDB fails and current level is 3', async () => {
      validatePayload.mockReturnValue({ valid: true, data: { message: 'test', timestamp: '2024-01-15T10:05:30Z', error: false } });
      getCurrentLevel.mockResolvedValue(3);
      getWindowKey.mockReturnValue('WINDOW#2024-01-15T10:05');
      incrementCounters.mockRejectedValue(new Error('DynamoDB unavailable'));

      const event = { body: '{}' };
      const result = await handler(event);

      expect(result.statusCode).toBe(503);
      const body = JSON.parse(result.body);
      expect(body.message).toBe('Nivel 3: Sistema bajo mantenimiento, intente más tarde');
      expect(body.level).toBe(3);
    });

    it('should return 500 when DynamoDB fails and current level is 1', async () => {
      validatePayload.mockReturnValue({ valid: true, data: { message: 'test', timestamp: '2024-01-15T10:05:30Z', error: false } });
      getCurrentLevel.mockResolvedValue(1);
      getWindowKey.mockReturnValue('WINDOW#2024-01-15T10:05');
      incrementCounters.mockRejectedValue(new Error('DynamoDB unavailable'));

      const event = { body: '{}' };
      const result = await handler(event);

      expect(result.statusCode).toBe(500);
      const body = JSON.parse(result.body);
      expect(body.message).toBe('Error interno del servidor');
      expect(body.level).toBeNull();
    });

    it('should return 500 when DynamoDB fails and current level is 2', async () => {
      validatePayload.mockReturnValue({ valid: true, data: { message: 'test', timestamp: '2024-01-15T10:05:30Z', error: false } });
      getCurrentLevel.mockResolvedValue(2);
      getWindowKey.mockReturnValue('WINDOW#2024-01-15T10:05');
      getWindowCounters.mockRejectedValue(new Error('DynamoDB unavailable'));
      incrementCounters.mockResolvedValue(undefined);

      const event = { body: '{}' };
      const result = await handler(event);

      expect(result.statusCode).toBe(500);
      const body = JSON.parse(result.body);
      expect(body.message).toBe('Error interno del servidor');
      expect(body.level).toBeNull();
    });
  });

  describe('logRequest is called correctly', () => {
    it('should call logRequest with error=true when request has error', async () => {
      validatePayload.mockReturnValue({ valid: true, data: { message: 'test', timestamp: '2024-01-15T10:05:30Z', error: true } });
      getCurrentLevel.mockResolvedValue(1);
      getWindowKey.mockReturnValue('WINDOW#2024-01-15T10:05');
      incrementCounters.mockResolvedValue(undefined);
      getWindowCounters.mockResolvedValue({ errorCount: 3, totalCount: 5 });
      evaluateTransition.mockReturnValue({ newLevel: 1, transitionType: null });

      const event = { body: '{}' };
      await handler(event);

      expect(logRequest).toHaveBeenCalledWith(1, true, '2024-01-15T10:05:30Z', 3);
    });
  });
});
