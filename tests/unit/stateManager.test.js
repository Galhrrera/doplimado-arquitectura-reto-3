import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock AWS SDK
const mockSend = vi.fn();
vi.mock('@aws-sdk/client-dynamodb', () => ({
  DynamoDBClient: vi.fn(() => ({ send: mockSend })),
  GetItemCommand: vi.fn((params) => ({ ...params, _type: 'GetItem' })),
  PutItemCommand: vi.fn((params) => ({ ...params, _type: 'PutItem' })),
  UpdateItemCommand: vi.fn((params) => ({ ...params, _type: 'UpdateItem' })),
}));

// Set env before importing module
process.env.STATE_TABLE_NAME = 'TestTable';

const {
  getWindowKey,
  getCurrentLevel,
  setLevel,
  initializeLevel,
  incrementCounters,
  getWindowCounters,
} = await import('../../src/stateManager.js');

describe('stateManager', () => {
  beforeEach(() => {
    mockSend.mockReset();
  });

  describe('getWindowKey', () => {
    it('should truncate timestamp to the minute', () => {
      const result = getWindowKey('2024-01-15T10:05:47.123Z');
      expect(result).toBe('WINDOW#2024-01-15T10:05');
    });

    it('should produce same key for timestamps in the same minute', () => {
      const key1 = getWindowKey('2024-01-15T10:05:00.000Z');
      const key2 = getWindowKey('2024-01-15T10:05:59.999Z');
      expect(key1).toBe(key2);
    });

    it('should produce different keys for different minutes', () => {
      const key1 = getWindowKey('2024-01-15T10:05:59.999Z');
      const key2 = getWindowKey('2024-01-15T10:06:00.000Z');
      expect(key1).not.toBe(key2);
    });

    it('should handle midnight correctly', () => {
      const result = getWindowKey('2024-01-15T00:00:30.000Z');
      expect(result).toBe('WINDOW#2024-01-15T00:00');
    });
  });

  describe('getCurrentLevel', () => {
    it('should return the level when it exists', async () => {
      mockSend.mockResolvedValue({
        Item: { pk: { S: 'SERVICE_LEVEL' }, level: { N: '2' } },
      });

      const level = await getCurrentLevel();
      expect(level).toBe(2);
    });

    it('should return null when no level exists', async () => {
      mockSend.mockResolvedValue({});

      const level = await getCurrentLevel();
      expect(level).toBeNull();
    });
  });

  describe('setLevel', () => {
    it('should call UpdateItem with correct parameters', async () => {
      mockSend.mockResolvedValue({});

      await setLevel(2);

      expect(mockSend).toHaveBeenCalledTimes(1);
      const call = mockSend.mock.calls[0][0];
      expect(call.TableName).toBe('TestTable');
      expect(call.Key).toEqual({ pk: { S: 'SERVICE_LEVEL' } });
      expect(call.UpdateExpression).toBe('SET #level = :level, lastUpdated = :ts');
      expect(call.ExpressionAttributeValues[':level']).toEqual({ N: '2' });
    });
  });

  describe('initializeLevel', () => {
    it('should return true when level is initialized successfully', async () => {
      mockSend.mockResolvedValue({});

      const result = await initializeLevel();
      expect(result).toBe(true);
    });

    it('should return false when level already exists', async () => {
      const error = new Error('Condition not met');
      error.name = 'ConditionalCheckFailedException';
      mockSend.mockRejectedValue(error);

      const result = await initializeLevel();
      expect(result).toBe(false);
    });

    it('should throw on other errors', async () => {
      const error = new Error('Network error');
      error.name = 'ServiceUnavailableException';
      mockSend.mockRejectedValue(error);

      await expect(initializeLevel()).rejects.toThrow('Network error');
    });
  });

  describe('incrementCounters', () => {
    it('should increment both errorCount and totalCount when isError is true', async () => {
      mockSend.mockResolvedValue({});

      await incrementCounters('WINDOW#2024-01-15T10:05', true);

      const call = mockSend.mock.calls[0][0];
      expect(call.UpdateExpression).toBe('ADD errorCount :one, totalCount :one');
      expect(call.Key).toEqual({ pk: { S: 'WINDOW#2024-01-15T10:05' } });
    });

    it('should increment only totalCount when isError is false', async () => {
      mockSend.mockResolvedValue({});

      await incrementCounters('WINDOW#2024-01-15T10:05', false);

      const call = mockSend.mock.calls[0][0];
      expect(call.UpdateExpression).toBe('ADD totalCount :one');
    });
  });

  describe('getWindowCounters', () => {
    it('should return counters when window exists', async () => {
      mockSend.mockResolvedValue({
        Item: {
          pk: { S: 'WINDOW#2024-01-15T10:05' },
          errorCount: { N: '5' },
          totalCount: { N: '12' },
        },
      });

      const counters = await getWindowCounters('WINDOW#2024-01-15T10:05');
      expect(counters).toEqual({ errorCount: 5, totalCount: 12 });
    });

    it('should return zeros when window does not exist', async () => {
      mockSend.mockResolvedValue({});

      const counters = await getWindowCounters('WINDOW#2024-01-15T10:05');
      expect(counters).toEqual({ errorCount: 0, totalCount: 0 });
    });

    it('should handle missing errorCount field', async () => {
      mockSend.mockResolvedValue({
        Item: {
          pk: { S: 'WINDOW#2024-01-15T10:05' },
          totalCount: { N: '3' },
        },
      });

      const counters = await getWindowCounters('WINDOW#2024-01-15T10:05');
      expect(counters).toEqual({ errorCount: 0, totalCount: 3 });
    });
  });
});
