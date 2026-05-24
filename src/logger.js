// logger.js - Logging estructurado y métricas CloudWatch

import { CloudWatchClient, PutMetricDataCommand } from '@aws-sdk/client-cloudwatch';

const cloudwatch = new CloudWatchClient();

/**
 * Registra una solicitud procesada como log JSON estructurado.
 * @param {number} level - Nivel de servicio actual (1, 2 o 3)
 * @param {boolean} error - Valor del campo error de la solicitud
 * @param {string} timestamp - Marca de tiempo en formato ISO 8601
 * @param {number} windowErrorCount - Conteo de errores acumulado en la ventana temporal actual
 */
export function logRequest(level, error, timestamp, windowErrorCount) {
  const entry = {
    type: 'request',
    level,
    error,
    timestamp,
    windowErrorCount,
  };
  console.log(JSON.stringify(entry));
}

/**
 * Registra una transición de nivel como log JSON estructurado.
 * @param {number} previousLevel - Nivel anterior
 * @param {number} newLevel - Nivel nuevo
 * @param {string} transitionType - Tipo de transición: "degradation" o "recovery"
 * @param {string} timestamp - Marca de tiempo en formato ISO 8601
 * @param {number} count - Conteo relevante (errores para degradación, total para recuperación)
 */
export function logTransition(previousLevel, newLevel, transitionType, timestamp, count) {
  const entry = {
    type: 'transition',
    previousLevel,
    newLevel,
    transitionType,
    timestamp,
  };

  if (transitionType === 'recovery') {
    entry.windowTotalCount = count;
  } else {
    entry.windowErrorCount = count;
  }

  console.log(JSON.stringify(entry));
}

/**
 * Emite una métrica personalizada a CloudWatch con el nivel de servicio actual.
 * @param {number} level - Nivel de servicio numérico (1, 2 o 3)
 */
export async function emitLevelMetric(level) {
  const command = new PutMetricDataCommand({
    Namespace: 'ResilienceService',
    MetricData: [
      {
        MetricName: 'ServiceLevel',
        Value: level,
        Unit: 'None',
      },
    ],
  });

  await cloudwatch.send(command);
}
