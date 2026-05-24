# Plan de Implementación: Niveles de Servicio Resilientes

## Visión General

Implementación de un sistema de degradación progresiva y recuperación automática usando AWS SAM (API Gateway + Lambda + DynamoDB). La implementación sigue un enfoque incremental: primero la infraestructura, luego los módulos internos de la Lambda (de menor a mayor dependencia), y finalmente la integración completa.

## Tasks

- [ ] 1. Configurar estructura del proyecto e infraestructura SAM
  - [x] 1.1 Crear template SAM con API Gateway, Lambda y DynamoDB
    - Crear archivo `template.yaml` con los recursos: `ServiceApi` (REST API, stage prod), `ServiceFunction` (Node.js 20.x, timeout 10s, memory 128MB), `StateTable` (DynamoDB on-demand, pk String)
    - Configurar la integración proxy entre API Gateway y Lambda en el recurso `/service-api` método POST
    - Definir variables de entorno en la Lambda para el nombre de la tabla DynamoDB
    - Configurar permisos IAM para que la Lambda acceda a DynamoDB y CloudWatch
    - _Requisitos: 9.1, 9.2, 9.3, 9.4, 8.1_

  - [x] 1.2 Crear estructura de directorios y archivos base del proyecto Lambda
    - Crear directorio `src/` con archivos vacíos: `handler.js`, `validator.js`, `stateManager.js`, `levelEngine.js`, `logger.js`
    - Crear `package.json` con dependencias: `@aws-sdk/client-dynamodb`, `@aws-sdk/client-cloudwatch`
    - Crear directorio `tests/` con subdirectorios `unit/` y `property/`
    - Agregar `fast-check` y framework de testing (vitest o jest) como devDependencies
    - _Requisitos: 9.4_

- [x] 2. Implementar módulo de validación
  - [x] 2.1 Implementar `validator.js` con la función `validatePayload`
    - Verificar que el body sea parseable como JSON
    - Validar presencia y tipo de `message` (string, máx 1024 caracteres)
    - Validar presencia y tipo de `timestamp` (string en formato ISO 8601)
    - Validar presencia y tipo de `error` (boolean estricto)
    - Retornar `{ valid: true, data }` o `{ valid: false, error: "descripción" }`
    - _Requisitos: 1.2, 1.3, 1.4_

  - [x] 2.2 Escribir test de propiedad para validación de payload
    - **Propiedad 1: Validación de payload acepta válidos y rechaza inválidos**
    - Generar payloads aleatorios válidos (message ≤1024, timestamp ISO 8601, error boolean) y verificar que retorna válido
    - Generar payloads inválidos (campos faltantes, tipos incorrectos, message >1024) y verificar que retorna inválido
    - **Valida: Requisitos 1.2, 1.3, 1.4**

- [x] 3. Implementar módulo de gestión de estado
  - [x] 3.1 Implementar `stateManager.js` con funciones de acceso a DynamoDB
    - Implementar `getWindowKey(timestamp)`: truncar timestamp ISO 8601 al minuto, retornar `WINDOW#YYYY-MM-DDTHH:MM`
    - Implementar `getCurrentLevel()`: GetItem con pk=SERVICE_LEVEL, retornar nivel o null si no existe
    - Implementar `setLevel(level)`: PutItem/UpdateItem para persistir nivel con lastUpdated
    - Implementar `incrementCounters(windowKey, isError)`: UpdateItem con ADD para incremento atómico
    - Implementar `getWindowCounters(windowKey)`: GetItem para obtener errorCount y totalCount
    - Inicializar nivel a 1 si no existe registro (PutItem con ConditionExpression attribute_not_exists)
    - _Requisitos: 2.1, 2.2, 2.3, 2.4, 7.1, 7.2_

  - [x] 3.2 Escribir test de propiedad para clave de ventana temporal
    - **Propiedad 2: Cálculo de clave de ventana temporal es truncamiento al minuto**
    - Generar timestamps ISO 8601 aleatorios y verificar que dos timestamps en el mismo minuto producen la misma clave
    - Verificar que timestamps en minutos diferentes producen claves diferentes
    - **Valida: Requisito 2.2**

- [ ] 4. Implementar motor de niveles de servicio
  - [x] 4.1 Implementar `levelEngine.js` con la función `evaluateTransition`
    - Recibir `(currentLevel, errorCount, totalCount)` y retornar `{ newLevel, transitionType }`
    - Implementar degradación: Nivel_1→Nivel_2 (errores≥5), Nivel_2→Nivel_3 (errores≥10), Nivel_1→Nivel_3 (errores≥10)
    - Implementar recuperación: Nivel_3→Nivel_2 y Nivel_2→Nivel_1 cuando errorCount=0 y totalCount≥5
    - Garantizar que degradación tiene prioridad sobre recuperación
    - Retornar `transitionType: null` si no hay cambio de nivel
    - _Requisitos: 3.1, 3.2, 3.3, 3.4, 3.5, 4.1, 4.2, 4.3, 4.4_

  - [x] 4.2 Escribir tests de propiedad para transiciones de degradación
    - **Propiedad 4: Transición de degradación según umbrales**
    - Generar combinaciones aleatorias de (nivel, errorCount, totalCount) y verificar transiciones correctas
    - **Valida: Requisitos 3.1, 3.2, 3.3, 3.5**

  - [x] 4.3 Escribir tests de propiedad para recuperación gradual
    - **Propiedad 5: Recuperación gradual de un solo nivel**
    - Generar estados con errorCount=0 y totalCount≥5 y verificar que solo sube un nivel
    - **Valida: Requisitos 4.1, 4.2, 4.3**

  - [x] 4.4 Escribir test de propiedad para prioridad de degradación
    - **Propiedad 6: Degradación tiene prioridad sobre recuperación**
    - Generar estados donde ambas condiciones se cumplen y verificar que se aplica degradación
    - **Valida: Requisito 4.4**

- [x] 5. Checkpoint - Verificar módulos base
  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. Implementar módulo de logging y métricas
  - [x] 6.1 Implementar `logger.js` con funciones de logging estructurado
    - Implementar `logRequest(level, error, timestamp, windowErrorCount)`: log JSON de solicitud
    - Implementar `logTransition(previousLevel, newLevel, transitionType, timestamp, count)`: log JSON de transición
    - Implementar `emitLevelMetric(level)`: PutMetricData a CloudWatch con namespace `ResilienceService`, métrica `ServiceLevel`
    - _Requisitos: 6.1, 6.2, 6.3, 6.4_

- [x] 7. Implementar handler principal e integrar módulos
  - [x] 7.1 Implementar `handler.js` orquestando el flujo completo
    - Parsear event.body y llamar a `validatePayload`; retornar 400 si inválido
    - Llamar a `getCurrentLevel()`; inicializar a Nivel_1 si no existe
    - Calcular windowKey con `getWindowKey(timestamp)` del payload
    - Llamar a `incrementCounters(windowKey, isError)` para actualizar contadores
    - Llamar a `getWindowCounters(windowKey)` para obtener conteos actualizados
    - Llamar a `evaluateTransition(currentLevel, errorCount, totalCount)`
    - Si hay transición: persistir nuevo nivel, emitir métrica, registrar log de transición
    - Registrar log de solicitud
    - Retornar respuesta con mensaje según nivel y campo `level`
    - Manejar errores de DynamoDB: 500 en inicialización, 503 en Nivel_3, 500 en otros niveles
    - _Requisitos: 1.1, 5.1, 5.2, 5.3, 5.4, 5.5, 7.1, 7.2, 7.3_

  - [x] 7.2 Escribir test de propiedad para respuesta según nivel
    - **Propiedad 7: Respuesta correcta según nivel de servicio**
    - Generar niveles válidos (1, 2, 3) y verificar que la respuesta contiene código 200, mensaje correcto y campo level
    - **Valida: Requisitos 5.1, 5.2, 5.3, 5.5**

- [x] 8. Checkpoint final - Verificar integración completa
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Las tareas marcadas con `*` son opcionales y pueden omitirse para un MVP más rápido
- Cada tarea referencia requisitos específicos para trazabilidad
- Los checkpoints aseguran validación incremental
- Los tests de propiedad validan propiedades universales de correctitud definidas en el diseño
- El runtime es Node.js 20.x con módulos ES (import/export)
- Se usa `fast-check` para tests de propiedad
- El SDK de AWS v3 se usa para DynamoDB y CloudWatch

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2"] },
    { "id": 1, "tasks": ["2.1", "3.1", "4.1", "6.1"] },
    { "id": 2, "tasks": ["2.2", "3.2", "4.2", "4.3", "4.4"] },
    { "id": 3, "tasks": ["7.1"] },
    { "id": 4, "tasks": ["7.2"] }
  ]
}
```
