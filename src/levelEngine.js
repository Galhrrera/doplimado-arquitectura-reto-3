// levelEngine.js - Lógica de transición de niveles

/**
 * Evalúa si debe ocurrir una transición de nivel de servicio.
 * La degradación tiene prioridad sobre la recuperación.
 *
 * @param {number} currentLevel - Nivel actual (1, 2 o 3)
 * @param {number} errorCount - Conteo de errores en la ventana temporal actual
 * @param {number} totalCount - Conteo total de solicitudes en la ventana temporal actual
 * @returns {{ newLevel: number, transitionType: 'degradation'|'recovery'|null }}
 */
export function evaluateTransition(currentLevel, errorCount, totalCount) {
  // 1. Evaluar degradación primero (tiene prioridad)
  const degradation = evaluateDegradation(currentLevel, errorCount);
  if (degradation) {
    return degradation;
  }

  // 2. Evaluar recuperación solo si no hay degradación
  const recovery = evaluateRecovery(currentLevel, errorCount, totalCount);
  if (recovery) {
    return recovery;
  }

  // 3. Sin cambio de nivel
  return { newLevel: currentLevel, transitionType: null };
}

/**
 * Evalúa condiciones de degradación.
 * IMPORTANTE: Para Nivel 1, verificar errorCount >= 10 ANTES de >= 5,
 * porque 10 errores deben ir directamente a Nivel 3.
 */
function evaluateDegradation(currentLevel, errorCount) {
  if (currentLevel === 1) {
    // Nivel 1 + errorCount >= 10 → Nivel 3 (verificar primero)
    if (errorCount >= 10) {
      return { newLevel: 3, transitionType: 'degradation' };
    }
    // Nivel 1 + errorCount >= 5 → Nivel 2
    if (errorCount >= 5) {
      return { newLevel: 2, transitionType: 'degradation' };
    }
  }

  if (currentLevel === 2) {
    // Nivel 2 + errorCount >= 10 → Nivel 3
    if (errorCount >= 10) {
      return { newLevel: 3, transitionType: 'degradation' };
    }
  }

  return null;
}

/**
 * Evalúa condiciones de recuperación.
 * Recuperación: errorCount === 0 y totalCount >= 5, sube un solo nivel.
 */
function evaluateRecovery(currentLevel, errorCount, totalCount) {
  if (errorCount === 0 && totalCount >= 5) {
    // Nivel 3 → Nivel 2
    if (currentLevel === 3) {
      return { newLevel: 2, transitionType: 'recovery' };
    }
    // Nivel 2 → Nivel 1
    if (currentLevel === 2) {
      return { newLevel: 1, transitionType: 'recovery' };
    }
  }

  return null;
}
