// validator.js - Validación del payload JSON

/**
 * Regex para validar formato ISO 8601.
 * Acepta formatos como: 2024-01-15T10:05:30Z, 2024-01-15T10:05:30.000Z,
 * 2024-01-15T10:05:30+05:00, 2024-01-15T10:05:30.123-03:00
 */
const ISO_8601_REGEX = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;

/**
 * Valida el payload recibido en el body de la solicitud.
 * @param {string} body - El body crudo de la solicitud (string).
 * @returns {{ valid: true, data: { message: string, timestamp: string, error: boolean } } | { valid: false, error: string }}
 */
export function validatePayload(body) {
  // 1. Verificar que el body sea parseable como JSON
  let parsed;
  try {
    parsed = JSON.parse(body);
  } catch {
    return { valid: false, error: "El formato del body no es JSON válido" };
  }

  // 2. Validar campo `message`: presencia y tipo string
  if (typeof parsed.message !== 'string') {
    return { valid: false, error: "Campo 'message' es inválido o está ausente" };
  }

  // 3. Validar que `message` no exceda 1024 caracteres
  if (parsed.message.length > 1024) {
    return { valid: false, error: "Campo 'message' excede el máximo de 1024 caracteres" };
  }

  // 4. Validar campo `timestamp`: presencia, tipo string y formato ISO 8601
  if (typeof parsed.timestamp !== 'string' || !ISO_8601_REGEX.test(parsed.timestamp)) {
    return { valid: false, error: "Campo 'timestamp' es inválido o está ausente" };
  }

  // 5. Validar campo `error`: presencia y tipo boolean estricto
  if (typeof parsed.error !== 'boolean') {
    return { valid: false, error: "Campo 'error' es inválido o está ausente" };
  }

  // Payload válido
  return {
    valid: true,
    data: {
      message: parsed.message,
      timestamp: parsed.timestamp,
      error: parsed.error,
    },
  };
}
