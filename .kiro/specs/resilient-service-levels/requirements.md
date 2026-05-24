# Documento de Requisitos

## Introducción

Sistema de niveles de servicio resilientes para Sistemas UltraSeguros S.A. que implementa degradación progresiva y recuperación automática. El sistema detecta errores en las solicitudes entrantes, ajusta dinámicamente el nivel de servicio (Completo, Degradado, Operación Mínima) y se recupera gradualmente cuando las condiciones de salud mejoran. Diseñado para ejecutarse en AWS con la arquitectura más simple posible que cumpla los requisitos.

## Glosario

- **API_Gateway**: Punto de entrada único de AWS API Gateway que recibe todas las solicitudes HTTP POST en el recurso `/service-api`
- **Lambda_Function**: Función AWS Lambda que procesa solicitudes, gestiona el conteo de errores, determina el nivel de servicio actual y genera la respuesta apropiada
- **State_Store**: Tabla DynamoDB que almacena el conteo de errores por ventana de tiempo y el nivel de servicio actual
- **Nivel_1**: Nivel de servicio completo donde todas las capacidades están activas
- **Nivel_2**: Nivel de servicio degradado donde solo las funcionalidades esenciales están disponibles
- **Nivel_3**: Nivel de operación mínima donde el sistema responde con mensajes de mantenimiento
- **Ventana_Temporal**: Período de un minuto utilizado para contar errores y determinar transiciones de nivel
- **Error_Request**: Solicitud entrante cuyo campo `error` en el payload JSON tiene valor `true`
- **CloudWatch_Logs**: Servicio de AWS utilizado para registrar transiciones de nivel y métricas del sistema

## Requisitos

### Requisito 1: Recepción de Solicitudes

**Historia de Usuario:** Como cliente de Sistemas UltraSeguros S.A., quiero enviar solicitudes al sistema a través de un endpoint único, para que mis peticiones sean procesadas según el nivel de servicio actual.

#### Criterios de Aceptación

1. WHEN una solicitud HTTP POST es recibida en el recurso `/service-api`, THE API_Gateway SHALL enrutar la solicitud a la Lambda_Function
2. THE Lambda_Function SHALL aceptar un payload JSON que contenga obligatoriamente los campos `message` (string, máximo 1024 caracteres), `timestamp` (string en formato ISO 8601) y `error` (boolean)
3. IF la solicitud no contiene un body parseable como JSON, THEN THE Lambda_Function SHALL responder con código HTTP 400 y un mensaje de error indicando que el formato del body no es JSON válido
4. IF el payload JSON no contiene alguno de los campos obligatorios (`message`, `timestamp`, `error`) o algún campo no cumple con su tipo de dato esperado, THEN THE Lambda_Function SHALL responder con código HTTP 400 y un mensaje de error indicando qué campo es inválido o está ausente

### Requisito 2: Conteo de Errores por Ventana Temporal

**Historia de Usuario:** Como operador del sistema, quiero que los errores se contabilicen en ventanas temporales de un minuto, para que el sistema pueda determinar cuándo degradar o recuperar el servicio.

#### Criterios de Aceptación

1. WHEN una Error_Request es recibida, THE Lambda_Function SHALL incrementar atómicamente el contador de errores de la Ventana_Temporal actual en el State_Store utilizando operaciones de actualización condicional
2. THE Lambda_Function SHALL utilizar ventanas de un minuto alineadas al inicio del minuto (segundo 00) para agrupar los conteos de errores, calculando la clave de ventana como el timestamp truncado al minuto
3. WHEN una solicitud con campo `error` igual a `false` es recibida, THE Lambda_Function SHALL incrementar únicamente el contador de solicitudes totales de la Ventana_Temporal actual sin modificar el contador de errores
4. THE Lambda_Function SHALL mantener un contador de solicitudes totales por Ventana_Temporal en el State_Store para evaluar las condiciones de recuperación

### Requisito 3: Transición de Nivel por Degradación

**Historia de Usuario:** Como operador del sistema, quiero que el sistema se degrade automáticamente cuando se acumulan errores, para que los servicios críticos sigan disponibles bajo carga.

#### Criterios de Aceptación

1. WHILE el sistema opera en Nivel_1 y el conteo de errores en la Ventana_Temporal actual alcanza 5 o más, THE Lambda_Function SHALL transicionar el nivel de servicio a Nivel_2 y persistir el nuevo nivel en el State_Store
2. WHILE el sistema opera en Nivel_2 y el conteo de errores en la Ventana_Temporal actual alcanza 10 o más, THE Lambda_Function SHALL transicionar el nivel de servicio a Nivel_3 y persistir el nuevo nivel en el State_Store
3. WHILE el sistema opera en Nivel_1 y el conteo de errores en la Ventana_Temporal actual alcanza 10 o más, THE Lambda_Function SHALL transicionar el nivel de servicio directamente a Nivel_3 y persistir el nuevo nivel en el State_Store
4. THE Lambda_Function SHALL evaluar las condiciones de transición de degradación en cada solicitud recibida, utilizando el conteo acumulado de errores de la Ventana_Temporal actual almacenado en el State_Store
5. WHEN una transición de nivel por degradación ocurre, THE Lambda_Function SHALL mantener el conteo de errores de la Ventana_Temporal actual sin reiniciarlo, permitiendo transiciones consecutivas dentro de la misma ventana

### Requisito 4: Transición de Nivel por Recuperación

**Historia de Usuario:** Como operador del sistema, quiero que el sistema se recupere gradualmente cuando los errores cesan, para restaurar todas las capacidades sin intervención manual.

#### Criterios de Aceptación

1. WHILE el sistema opera en Nivel_3 y la Ventana_Temporal actual registra 0 errores con al menos 5 solicitudes totales procesadas (incluyendo solicitudes con campo `error` en `true` y `false`), THE Lambda_Function SHALL transicionar el nivel de servicio a Nivel_2
2. WHILE el sistema opera en Nivel_2 y la Ventana_Temporal actual registra 0 errores con al menos 5 solicitudes totales procesadas (incluyendo solicitudes con campo `error` en `true` y `false`), THE Lambda_Function SHALL transicionar el nivel de servicio a Nivel_1
3. THE Lambda_Function SHALL realizar la recuperación avanzando un solo nivel por cada Ventana_Temporal que registre 0 errores y al menos 5 solicitudes totales procesadas, evaluando las condiciones de recuperación en cada solicitud recibida
4. IF en la misma Ventana_Temporal se cumplen condiciones de degradación y de recuperación, THEN THE Lambda_Function SHALL aplicar la degradación con prioridad sobre la recuperación

### Requisito 5: Respuestas según Nivel de Servicio

**Historia de Usuario:** Como cliente de Sistemas UltraSeguros S.A., quiero recibir respuestas apropiadas según el estado del sistema, para saber si mis solicitudes fueron procesadas completamente o si el sistema está en modo reducido.

#### Criterios de Aceptación

1. WHILE el sistema opera en Nivel_1, THE Lambda_Function SHALL responder con código HTTP 200 y un cuerpo JSON que contenga un campo de mensaje con el texto "Nivel 1: Operación completa, todas las capacidades activas"
2. WHILE el sistema opera en Nivel_2, THE Lambda_Function SHALL responder con código HTTP 200 y un cuerpo JSON que contenga un campo de mensaje con el texto "Nivel 2: Operación degradada, funcionalidades esenciales disponibles"
3. WHILE el sistema opera en Nivel_3, IF la solicitud es procesada sin errores internos de la Lambda_Function, THEN THE Lambda_Function SHALL responder con código HTTP 200 y un cuerpo JSON que contenga un campo de mensaje con el texto "Nivel 3: Operación al mínimo"
4. WHILE el sistema opera en Nivel_3, IF la Lambda_Function encuentra un error interno durante el procesamiento de la solicitud (fallo de lectura o escritura al State_Store), THEN THE Lambda_Function SHALL responder con código HTTP 503 y un cuerpo JSON que contenga un campo de mensaje con el texto "Nivel 3: Sistema bajo mantenimiento, intente más tarde"
5. THE Lambda_Function SHALL incluir en cada respuesta el nivel de servicio actual como un campo adicional en el cuerpo JSON de respuesta

### Requisito 6: Registro de Transiciones y Métricas

**Historia de Usuario:** Como operador del sistema, quiero que todas las transiciones de nivel y métricas clave se registren, para poder auditar el comportamiento del sistema y diagnosticar problemas.

#### Criterios de Aceptación

1. WHEN el nivel de servicio cambia por degradación, THE Lambda_Function SHALL registrar en CloudWatch_Logs una entrada JSON estructurada con los campos: nivel anterior, nivel nuevo, marca de tiempo en formato ISO 8601, conteo de errores en la Ventana_Temporal actual y tipo de transición "degradación"
2. WHEN el nivel de servicio cambia por recuperación, THE Lambda_Function SHALL registrar en CloudWatch_Logs una entrada JSON estructurada con los campos: nivel anterior, nivel nuevo, marca de tiempo en formato ISO 8601, conteo de solicitudes en la Ventana_Temporal actual y tipo de transición "recuperación"
3. THE Lambda_Function SHALL registrar en CloudWatch_Logs cada solicitud procesada como una entrada JSON estructurada incluyendo el nivel de servicio actual, el valor del campo `error`, la marca de tiempo en formato ISO 8601 y el conteo de errores acumulado en la Ventana_Temporal actual
4. WHEN el nivel de servicio cambia, THE Lambda_Function SHALL emitir una métrica personalizada en CloudWatch con valor numérico correspondiente al nuevo nivel (Nivel_1 = 1, Nivel_2 = 2, Nivel_3 = 3)

### Requisito 7: Estado Inicial del Sistema

**Historia de Usuario:** Como operador del sistema, quiero que el sistema inicie siempre en nivel completo, para que los clientes tengan acceso a todas las funcionalidades al arrancar.

#### Criterios de Aceptación

1. WHEN la Lambda_Function es invocada y no existe un registro de nivel en el State_Store, THE Lambda_Function SHALL escribir el nivel de servicio Nivel_1 en el State_Store antes de procesar la lógica de negocio de la solicitud
2. WHEN la Lambda_Function es invocada y no existe un registro de conteo de errores para la Ventana_Temporal actual, THE Lambda_Function SHALL escribir el contador inicializado en 0 en el State_Store antes de procesar la lógica de negocio de la solicitud
3. IF la Lambda_Function no puede leer o escribir en el State_Store durante la inicialización, THEN THE Lambda_Function SHALL responder con código HTTP 500 y un mensaje indicando que el servicio no está disponible temporalmente

### Requisito 8: Compatibilidad con Script de Pruebas K6

**Historia de Usuario:** Como evaluador del sistema, quiero que el sistema sea compatible con el script de pruebas K6 proporcionado, para validar que las transiciones de nivel ocurren según lo esperado.

#### Criterios de Aceptación

1. THE API_Gateway SHALL exponer el endpoint en la URL `https://{api-id}.execute-api.us-east-2.amazonaws.com/prod/service-api` aceptando método POST con encabezado `Content-Type: application/json`
2. THE Lambda_Function SHALL procesar 20 solicitudes por minuto (una cada 3 segundos) sin errores de timeout (configuración de timeout de Lambda no menor a 10 segundos) ni throttling durante la ejecución completa de 140 iteraciones
3. WHEN el script K6 envía 5 Error_Requests en el minuto 1, THE Lambda_Function SHALL transicionar de Nivel_1 a Nivel_2 al alcanzar el umbral de 5 errores en la Ventana_Temporal
4. WHEN el script K6 envía 0 Error_Requests en el minuto 2 con 20 solicitudes procesadas, THE Lambda_Function SHALL transicionar de Nivel_2 a Nivel_1 al cumplir la condición de recuperación
5. WHEN el script K6 envía 15 Error_Requests en el minuto 3, THE Lambda_Function SHALL transicionar de Nivel_1 a Nivel_2 al alcanzar 5 errores y posteriormente de Nivel_2 a Nivel_3 al alcanzar 10 errores en la misma Ventana_Temporal
6. WHEN el script K6 envía 0 Error_Requests en los minutos de recuperación (minutos 4 y 6), THE Lambda_Function SHALL transicionar un nivel hacia arriba por cada Ventana_Temporal saludable con al menos 5 solicitudes sin errores

### Requisito 9: Restricciones de Arquitectura

**Historia de Usuario:** Como arquitecto del sistema, quiero que la solución utilice exclusivamente servicios AWS sin invocaciones Lambda-a-Lambda, para cumplir con las buenas prácticas y restricciones del proyecto.

#### Criterios de Aceptación

1. THE Lambda_Function SHALL ser la única función Lambda en la arquitectura, sin invocar directa ni indirectamente otras funciones Lambda mediante ningún mecanismo (invocación síncrona, eventos, colas o servicios de orquestación)
2. THE API_Gateway SHALL ser el único punto de entrada al sistema, enrutando solicitudes HTTP al Lambda_Function sin servicios intermediarios de procesamiento entre ambos
3. THE State_Store SHALL utilizar DynamoDB como único servicio de persistencia, almacenando el conteo de errores por Ventana_Temporal y el nivel de servicio actual
4. THE Lambda_Function SHALL utilizar en tiempo de ejecución únicamente los siguientes servicios AWS: API Gateway (recepción), DynamoDB (persistencia) y CloudWatch (logs y métricas), sin dependencias a servicios externos o servicios AWS adicionales para el procesamiento de solicitudes
