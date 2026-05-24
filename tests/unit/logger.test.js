import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { logRequest, logTransition, emitLevelMetric } from '../../src/logger.js';

// Mock the CloudWatch client
vi.mock('@aws-sdk/client-cloudwatch', () => {
  const sendMock = vi.fn().mockResolvedValue({});
  return {
    CloudWatchClient: vi.fn(() => ({ send: sendMock })),
    PutMetricDataCommand: vi.fn((input) => ({ input })),
  };
});

describe('logger.js', () => {
  let consoleSpy;

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
    vi.clearAllMocks();
  });

  describe('logRequest', () => {
    it('should log a structured JSON entry for a request', () => {
      logRequest(1, false, '2024-01-15T10:05:30.000Z', 3);

      expect(consoleSpy).toHaveBeenCalledOnce();
      const logged = JSON.parse(consoleSpy.mock.calls[0][0]);
      expect(logged).toEqual({
        type: 'request',
        level: 1,
        error: false,
        timestamp: '2024-01-15T10:05:30.000Z',
        windowErrorCount: 3,
      });
    });

    it('should log error=true correctly', () => {
      logRequest(2, true, '2024-01-15T10:06:00.000Z', 7);

      const logged = JSON.parse(consoleSpy.mock.calls[0][0]);
      expect(logged.error).toBe(true);
      expect(logged.level).toBe(2);
      expect(logged.windowErrorCount).toBe(7);
    });

    it('should log level 3 correctly', () => {
      logRequest(3, false, '2024-01-15T10:07:00.000Z', 0);

      const logged = JSON.parse(consoleSpy.mock.calls[0][0]);
      expect(logged.level).toBe(3);
      expect(logged.type).toBe('request');
    });
  });

  describe('logTransition', () => {
    it('should log a degradation transition with windowErrorCount', () => {
      logTransition(1, 2, 'degradation', '2024-01-15T10:05:30.000Z', 5);

      expect(consoleSpy).toHaveBeenCalledOnce();
      const logged = JSON.parse(consoleSpy.mock.calls[0][0]);
      expect(logged).toEqual({
        type: 'transition',
        previousLevel: 1,
        newLevel: 2,
        transitionType: 'degradation',
        timestamp: '2024-01-15T10:05:30.000Z',
        windowErrorCount: 5,
      });
    });

    it('should log a recovery transition with windowTotalCount', () => {
      logTransition(2, 1, 'recovery', '2024-01-15T10:05:30.000Z', 5);

      expect(consoleSpy).toHaveBeenCalledOnce();
      const logged = JSON.parse(consoleSpy.mock.calls[0][0]);
      expect(logged).toEqual({
        type: 'transition',
        previousLevel: 2,
        newLevel: 1,
        transitionType: 'recovery',
        timestamp: '2024-01-15T10:05:30.000Z',
        windowTotalCount: 5,
      });
    });

    it('should not include windowTotalCount for degradation', () => {
      logTransition(1, 3, 'degradation', '2024-01-15T10:05:30.000Z', 10);

      const logged = JSON.parse(consoleSpy.mock.calls[0][0]);
      expect(logged).toHaveProperty('windowErrorCount', 10);
      expect(logged).not.toHaveProperty('windowTotalCount');
    });

    it('should not include windowErrorCount for recovery', () => {
      logTransition(3, 2, 'recovery', '2024-01-15T10:05:30.000Z', 8);

      const logged = JSON.parse(consoleSpy.mock.calls[0][0]);
      expect(logged).toHaveProperty('windowTotalCount', 8);
      expect(logged).not.toHaveProperty('windowErrorCount');
    });
  });

  describe('emitLevelMetric', () => {
    it('should call CloudWatch PutMetricData with correct parameters', async () => {
      const { PutMetricDataCommand } = await import('@aws-sdk/client-cloudwatch');

      await emitLevelMetric(2);

      expect(PutMetricDataCommand).toHaveBeenCalledWith({
        Namespace: 'ResilienceService',
        MetricData: [
          {
            MetricName: 'ServiceLevel',
            Value: 2,
            Unit: 'None',
          },
        ],
      });
    });

    it('should emit metric for level 1', async () => {
      const { PutMetricDataCommand } = await import('@aws-sdk/client-cloudwatch');

      await emitLevelMetric(1);

      expect(PutMetricDataCommand).toHaveBeenCalledWith(
        expect.objectContaining({
          Namespace: 'ResilienceService',
          MetricData: [expect.objectContaining({ Value: 1 })],
        })
      );
    });

    it('should emit metric for level 3', async () => {
      const { PutMetricDataCommand } = await import('@aws-sdk/client-cloudwatch');

      await emitLevelMetric(3);

      expect(PutMetricDataCommand).toHaveBeenCalledWith(
        expect.objectContaining({
          Namespace: 'ResilienceService',
          MetricData: [expect.objectContaining({ Value: 3 })],
        })
      );
    });
  });
});
