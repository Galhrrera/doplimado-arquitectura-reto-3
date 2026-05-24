import { describe, it, expect } from 'vitest';
import { evaluateTransition } from '../../src/levelEngine.js';

describe('evaluateTransition', () => {
  describe('Degradación', () => {
    it('Nivel 1 → Nivel 2 cuando errorCount >= 5 y < 10', () => {
      const result = evaluateTransition(1, 5, 10);
      expect(result).toEqual({ newLevel: 2, transitionType: 'degradation' });
    });

    it('Nivel 1 → Nivel 2 con exactamente 5 errores', () => {
      const result = evaluateTransition(1, 5, 5);
      expect(result).toEqual({ newLevel: 2, transitionType: 'degradation' });
    });

    it('Nivel 1 → Nivel 3 cuando errorCount >= 10 (salto directo)', () => {
      const result = evaluateTransition(1, 10, 15);
      expect(result).toEqual({ newLevel: 3, transitionType: 'degradation' });
    });

    it('Nivel 1 → Nivel 3 con 15 errores', () => {
      const result = evaluateTransition(1, 15, 20);
      expect(result).toEqual({ newLevel: 3, transitionType: 'degradation' });
    });

    it('Nivel 2 → Nivel 3 cuando errorCount >= 10', () => {
      const result = evaluateTransition(2, 10, 15);
      expect(result).toEqual({ newLevel: 3, transitionType: 'degradation' });
    });

    it('Nivel 2 → Nivel 3 con 12 errores', () => {
      const result = evaluateTransition(2, 12, 20);
      expect(result).toEqual({ newLevel: 3, transitionType: 'degradation' });
    });

    it('Nivel 1 no degrada con 4 errores', () => {
      const result = evaluateTransition(1, 4, 10);
      expect(result).toEqual({ newLevel: 1, transitionType: null });
    });

    it('Nivel 2 no degrada con 9 errores', () => {
      const result = evaluateTransition(2, 9, 15);
      expect(result).toEqual({ newLevel: 2, transitionType: null });
    });

    it('Nivel 3 no degrada más (ya es el mínimo)', () => {
      const result = evaluateTransition(3, 15, 20);
      expect(result).toEqual({ newLevel: 3, transitionType: null });
    });
  });

  describe('Recuperación', () => {
    it('Nivel 3 → Nivel 2 cuando errorCount=0 y totalCount>=5', () => {
      const result = evaluateTransition(3, 0, 5);
      expect(result).toEqual({ newLevel: 2, transitionType: 'recovery' });
    });

    it('Nivel 2 → Nivel 1 cuando errorCount=0 y totalCount>=5', () => {
      const result = evaluateTransition(2, 0, 5);
      expect(result).toEqual({ newLevel: 1, transitionType: 'recovery' });
    });

    it('Nivel 3 → Nivel 2 con totalCount=20', () => {
      const result = evaluateTransition(3, 0, 20);
      expect(result).toEqual({ newLevel: 2, transitionType: 'recovery' });
    });

    it('Nivel 1 no se recupera (ya es el máximo)', () => {
      const result = evaluateTransition(1, 0, 10);
      expect(result).toEqual({ newLevel: 1, transitionType: null });
    });

    it('No recupera si totalCount < 5', () => {
      const result = evaluateTransition(3, 0, 4);
      expect(result).toEqual({ newLevel: 3, transitionType: null });
    });

    it('No recupera si errorCount > 0', () => {
      const result = evaluateTransition(3, 1, 10);
      expect(result).toEqual({ newLevel: 3, transitionType: null });
    });
  });

  describe('Prioridad: degradación sobre recuperación', () => {
    it('Nivel 2 con errorCount>=10 degrada aunque totalCount>=5 y podría recuperar', () => {
      // Este caso no aplica realmente porque errorCount>0 impide recuperación,
      // pero verifica que degradación se evalúa primero
      const result = evaluateTransition(2, 10, 10);
      expect(result).toEqual({ newLevel: 3, transitionType: 'degradation' });
    });

    it('Nivel 1 con errorCount>=5 degrada aunque totalCount>=5', () => {
      const result = evaluateTransition(1, 5, 10);
      expect(result).toEqual({ newLevel: 2, transitionType: 'degradation' });
    });
  });

  describe('Sin transición', () => {
    it('Nivel 1 con 0 errores y totalCount < 5', () => {
      const result = evaluateTransition(1, 0, 3);
      expect(result).toEqual({ newLevel: 1, transitionType: null });
    });

    it('Nivel 2 con errores entre 1 y 9', () => {
      const result = evaluateTransition(2, 5, 10);
      expect(result).toEqual({ newLevel: 2, transitionType: null });
    });

    it('Nivel 3 con errores > 0 y totalCount >= 5', () => {
      const result = evaluateTransition(3, 3, 10);
      expect(result).toEqual({ newLevel: 3, transitionType: null });
    });
  });
});
