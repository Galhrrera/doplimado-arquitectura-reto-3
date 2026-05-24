// handler.js - Entry point, orquesta el flujo de la Lambda Function

import { validatePayload } from './validator.js';
import { getCurrentLevel, setLevel, initializeLevel, incrementCounters, getWindowCounters, getWindowKey } from './stateManager.js';
import { evaluateTransition } from './levelEngine.js';
import { logRequest, logTransition, emitLevelMetric } from './logger.js';

const LEVEL_MESSAGES = {
  1: 'Nivel 1: Operación completa, todas las capacidades activas',
  2: 'Nivel 2: Operación degradada, funcionalidades esenciales disponibles',
  3: 'Nivel 3: Operación al mínimo',
};

export async function handler(event) {
  // 1. Parsear y validar payload
  const validation = validatePayload(event.body);
  if (!validation.valid) {
    return {
      statusCode: 400,
      body: JSON.stringify({ message: validation.error, level: null }),
    };
  }

  const { timestamp, error: isError } = validation.data;

  // 2. Leer estado actual de DynamoDB; inicializar si no existe
  let currentLevel;
  try {
    currentLevel = await getCurrentLevel();
    if (currentLevel === null) {
      await initializeLevel();
      currentLevel = 1;
    }
  } catch (err) {
    // DynamoDB falla durante inicialización → 500
    return {
      statusCode: 500,
      body: JSON.stringify({ message: 'Servicio no disponible temporalmente', level: null }),
    };
  }

  // 3-6. Actualizar contadores, evaluar transición, persistir y loguear
  try {
    // 3. Calcular windowKey y actualizar contadores
    const windowKey = getWindowKey(timestamp);
    await incrementCounters(windowKey, isError);

    // 4. Obtener conteos actualizados
    const { errorCount, totalCount } = await getWindowCounters(windowKey);

    // 5. Evaluar transición
    const { newLevel, transitionType } = evaluateTransition(currentLevel, errorCount, totalCount);

    // 6. Si hay transición: persistir, emitir métrica, loguear transición
    let finalLevel = currentLevel;
    if (transitionType !== null) {
      finalLevel = newLevel;
      await setLevel(newLevel);
      await emitLevelMetric(newLevel);
      const count = transitionType === 'recovery' ? totalCount : errorCount;
      logTransition(currentLevel, newLevel, transitionType, timestamp, count);
    } else {
      finalLevel = newLevel;
    }

    // 7. Registrar log de solicitud
    logRequest(finalLevel, isError, timestamp, errorCount);

    // 8. Retornar respuesta según nivel
    return {
      statusCode: 200,
      body: JSON.stringify({ message: LEVEL_MESSAGES[finalLevel], level: finalLevel }),
    };
  } catch (err) {
    // DynamoDB falla después de inicialización
    if (currentLevel === 3) {
      return {
        statusCode: 503,
        body: JSON.stringify({ message: 'Nivel 3: Sistema bajo mantenimiento, intente más tarde', level: 3 }),
      };
    }
    return {
      statusCode: 500,
      body: JSON.stringify({ message: 'Error interno del servidor', level: null }),
    };
  }
}
