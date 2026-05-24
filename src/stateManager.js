// stateManager.js - Lectura/escritura en DynamoDB
import {
  DynamoDBClient,
  GetItemCommand,
  PutItemCommand,
  UpdateItemCommand,
} from '@aws-sdk/client-dynamodb';

const client = new DynamoDBClient({});
const TABLE_NAME = process.env.STATE_TABLE_NAME;

/**
 * Trunca un timestamp ISO 8601 al minuto y retorna la clave de ventana.
 * @param {string} timestamp - Timestamp en formato ISO 8601
 * @returns {string} Clave de ventana con formato "WINDOW#YYYY-MM-DDTHH:MM"
 */
export function getWindowKey(timestamp) {
  const date = new Date(timestamp);
  const truncated = date.toISOString().slice(0, 16);
  return `WINDOW#${truncated}`;
}

/**
 * Obtiene el nivel de servicio actual desde DynamoDB.
 * @returns {Promise<number|null>} Nivel actual (1, 2 o 3) o null si no existe
 */
export async function getCurrentLevel() {
  const command = new GetItemCommand({
    TableName: TABLE_NAME,
    Key: { pk: { S: 'SERVICE_LEVEL' } },
  });

  const response = await client.send(command);

  if (!response.Item) {
    return null;
  }

  return Number(response.Item.level.N);
}

/**
 * Persiste el nivel de servicio en DynamoDB con lastUpdated.
 * @param {number} level - Nivel de servicio (1, 2 o 3)
 */
export async function setLevel(level) {
  const command = new UpdateItemCommand({
    TableName: TABLE_NAME,
    Key: { pk: { S: 'SERVICE_LEVEL' } },
    UpdateExpression: 'SET #level = :level, lastUpdated = :ts',
    ExpressionAttributeNames: { '#level': 'level' },
    ExpressionAttributeValues: {
      ':level': { N: String(level) },
      ':ts': { S: new Date().toISOString() },
    },
  });

  await client.send(command);
}

/**
 * Inicializa el nivel de servicio a 1 si no existe registro.
 * Usa ConditionExpression attribute_not_exists para evitar sobreescritura.
 * @returns {Promise<boolean>} true si se inicializó, false si ya existía
 */
export async function initializeLevel() {
  try {
    const command = new PutItemCommand({
      TableName: TABLE_NAME,
      Item: {
        pk: { S: 'SERVICE_LEVEL' },
        level: { N: '1' },
        lastUpdated: { S: new Date().toISOString() },
      },
      ConditionExpression: 'attribute_not_exists(pk)',
    });

    await client.send(command);
    return true;
  } catch (error) {
    if (error.name === 'ConditionalCheckFailedException') {
      return false;
    }
    throw error;
  }
}

/**
 * Incrementa atómicamente los contadores de una ventana temporal.
 * Si isError es true, incrementa tanto errorCount como totalCount.
 * Si isError es false, incrementa solo totalCount.
 * @param {string} windowKey - Clave de ventana (e.g., "WINDOW#2024-01-15T10:05")
 * @param {boolean} isError - Si la solicitud es un error
 */
export async function incrementCounters(windowKey, isError) {
  const expressionAttributeValues = {
    ':one': { N: '1' },
  };

  let updateExpression;

  if (isError) {
    updateExpression = 'ADD errorCount :one, totalCount :one';
  } else {
    updateExpression = 'ADD totalCount :one';
  }

  const command = new UpdateItemCommand({
    TableName: TABLE_NAME,
    Key: { pk: { S: windowKey } },
    UpdateExpression: updateExpression,
    ExpressionAttributeValues: expressionAttributeValues,
  });

  await client.send(command);
}

/**
 * Obtiene los contadores de una ventana temporal.
 * @param {string} windowKey - Clave de ventana (e.g., "WINDOW#2024-01-15T10:05")
 * @returns {Promise<{errorCount: number, totalCount: number}>} Contadores de la ventana
 */
export async function getWindowCounters(windowKey) {
  const command = new GetItemCommand({
    TableName: TABLE_NAME,
    Key: { pk: { S: windowKey } },
  });

  const response = await client.send(command);

  if (!response.Item) {
    return { errorCount: 0, totalCount: 0 };
  }

  return {
    errorCount: response.Item.errorCount ? Number(response.Item.errorCount.N) : 0,
    totalCount: response.Item.totalCount ? Number(response.Item.totalCount.N) : 0,
  };
}
