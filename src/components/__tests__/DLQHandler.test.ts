import { DLQHandler } from '../DLQHandler';
import { ConnectionManager } from '../ConnectionManager';
import { ResourceCreator } from '../ResourceCreator';
import { IConfiguration } from '../../interfaces/IConfiguration';

// Mock dependencies
jest.mock('../ConnectionManager');
jest.mock('../ResourceCreator');
jest.mock('../Logger', () => ({
  Logger: {
    createComponentLogger: jest.fn().mockReturnValue({
      logOperation: jest.fn(),
      logError: jest.fn(),
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
    })
  }
}));

describe('DLQHandler', () => {
  let dlqHandler: DLQHandler;
  let mockConnectionManager: jest.Mocked<ConnectionManager>;
  let mockResourceCreator: jest.Mocked<ResourceCreator>;
  let mockConfig: IConfiguration;

  const mockChannel = {
    publish: jest.fn(),
    close: jest.fn(),
  };

  const mockConnection = {
    createChannel: jest.fn().mockResolvedValue(mockChannel),
  };

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();

    // Create mock instances using Object.create to avoid constructor issues
    mockConnectionManager = Object.create(ConnectionManager.prototype);
    mockResourceCreator = Object.create(ResourceCreator.prototype);

    // Setup default mock implementations
    mockConnectionManager.getConnection = jest.fn().mockReturnValue(mockConnection as any);
    mockConnectionManager.executeOperation = jest.fn().mockImplementation(async (operation) => {
      return await operation();
    });

    mockResourceCreator.ensureExchange = jest.fn().mockResolvedValue(undefined);
    mockResourceCreator.ensureQueue = jest.fn().mockResolvedValue(undefined);
    mockResourceCreator.bindQueue = jest.fn().mockResolvedValue(undefined);
    mockResourceCreator.unbindQueue = jest.fn().mockResolvedValue(undefined);

    mockChannel.publish.mockReturnValue(true);
    mockChannel.close.mockResolvedValue(undefined);

    // Default config with DLQ enabled
    mockConfig = {
      url: 'amqp://localhost:5672',
      dlq: {
        active: true,
        ttl: 300000,
        maxRetries: 3,
        retryDelay: 5000,
      },
      logging: {
        level: 'info',
        format: 'json',
      },
    };

    dlqHandler = new DLQHandler(mockConfig, mockConnectionManager, mockResourceCreator);
  });

  describe('DLQ Configuration and Status', () => {
    it('should return true when DLQ is enabled in configuration', () => {
      expect(dlqHandler.isEnabled()).toBe(true);
    });

    it('should return false when DLQ is disabled in configuration', () => {
      const disabledConfig = { ...mockConfig, dlq: { active: false } };
      const disabledDlqHandler = new DLQHandler(disabledConfig, mockConnectionManager, mockResourceCreator);
      
      expect(disabledDlqHandler.isEnabled()).toBe(false);
    });

    it('should return DLQ configuration', () => {
      const dlqConfig = dlqHandler.getDLQConfig();
      
      expect(dlqConfig).toEqual(mockConfig.dlq);
    });
  });

  describe('DLQ Setup with Various Configurations', () => {
    it('should setup DLQ with complete configuration', async () => {
      const originalQueue = 'test-queue';
      const expectedDlqExchange = 'test-queue.dlq';
      const expectedDlqQueue = 'test-queue.dlq';

      const result = await dlqHandler.setupDLQ(originalQueue);

      expect(mockResourceCreator.ensureExchange).toHaveBeenCalledWith(
        expectedDlqExchange,
        'direct',
        { durable: true, autoDelete: false }
      );

      expect(mockResourceCreator.ensureQueue).toHaveBeenCalledWith(
        expectedDlqQueue,
        {
          durable: true,
          exclusive: false,
          autoDelete: false,
          arguments: { 'x-message-ttl': 300000 }
        }
      );

      expect(mockResourceCreator.bindQueue).toHaveBeenCalledWith(
        expectedDlqQueue,
        expectedDlqExchange,
        originalQueue
      );

      expect(result).toBe(expectedDlqQueue);
    });

    it('should setup DLQ without TTL when not configured', async () => {
      const configWithoutTTL = {
        ...mockConfig,
        dlq: { active: true, maxRetries: 3, retryDelay: 5000 }
      };
      const dlqHandlerWithoutTTL = new DLQHandler(configWithoutTTL, mockConnectionManager, mockResourceCreator);

      await dlqHandlerWithoutTTL.setupDLQ('test-queue');

      expect(mockResourceCreator.ensureQueue).toHaveBeenCalledWith(
        'test-queue.dlq',
        {
          durable: true,
          exclusive: false,
          autoDelete: false
        }
      );
    });

    it('should setup DLQ with zero TTL when configured', async () => {
      const configWithZeroTTL = {
        ...mockConfig,
        dlq: { active: true, ttl: 0, maxRetries: 3, retryDelay: 5000 }
      };
      const dlqHandlerWithZeroTTL = new DLQHandler(configWithZeroTTL, mockConnectionManager, mockResourceCreator);

      await dlqHandlerWithZeroTTL.setupDLQ('test-queue');

      expect(mockResourceCreator.ensureQueue).toHaveBeenCalledWith(
        'test-queue.dlq',
        {
          durable: true,
          exclusive: false,
          autoDelete: false
        }
      );
    });

    it('should use cache to avoid duplicate DLQ setup', async () => {
      const originalQueue = 'test-queue';

      // First setup
      await dlqHandler.setupDLQ(originalQueue);
      
      // Second setup should use cache
      await dlqHandler.setupDLQ(originalQueue);

      // Should only call resource creation once
      expect(mockResourceCreator.ensureExchange).toHaveBeenCalledTimes(1);
      expect(mockResourceCreator.ensureQueue).toHaveBeenCalledTimes(1);
      expect(mockResourceCreator.bindQueue).toHaveBeenCalledTimes(1);
    });

    it('should throw error when original queue name is empty', async () => {
      await expect(dlqHandler.setupDLQ('')).rejects.toThrow(
        'Original queue name is required for DLQ setup'
      );
    });

    it('should throw error when DLQ is disabled', async () => {
      const disabledConfig = { ...mockConfig, dlq: { active: false } };
      const disabledDlqHandler = new DLQHandler(disabledConfig, mockConnectionManager, mockResourceCreator);

      await expect(disabledDlqHandler.setupDLQ('test-queue')).rejects.toThrow(
        'DLQ is not enabled in configuration'
      );
    });

    it('should handle resource creation failures', async () => {
      const error = new Error('Exchange creation failed');
      mockResourceCreator.ensureExchange.mockRejectedValue(error);

      await expect(dlqHandler.setupDLQ('test-queue')).rejects.toThrow(error);
    });
  });

  describe('Failed Message Routing to DLQ', () => {
    it('should route failed message to DLQ with complete metadata', async () => {
      const originalQueue = 'test-queue';
      const message = {
        content: Buffer.from('test message'),
        properties: {
          messageId: 'msg-123',
          timestamp: 1234567890,
          headers: { 'x-retry-count': 1 }
        },
        fields: {
          exchange: 'original-exchange',
          routingKey: 'original-key',
          deliveryTag: 1,
          redelivered: false
        }
      };

      await dlqHandler.handleFailedMessage(message, originalQueue);

      expect(mockChannel.publish).toHaveBeenCalledWith(
        'test-queue.dlq',
        originalQueue,
        expect.any(Buffer),
        {
          persistent: true,
          timestamp: expect.any(Number),
          headers: {
            'x-dlq-routed': true,
            'x-original-queue': originalQueue
          }
        }
      );

      // Verify message content structure
      const publishCall = mockChannel.publish.mock.calls[0];
      const messageBuffer = publishCall[2] as Buffer;
      const parsedMessage = JSON.parse(messageBuffer.toString());

      expect(parsedMessage).toMatchObject({
        originalMessage: expect.any(Object), // Buffer gets serialized as object
        dlqMetadata: {
          originalQueue: originalQueue,
          originalExchange: 'original-exchange',
          originalRoutingKey: 'original-key',
          retryCount: 2, // Should increment from 1 to 2
          maxRetries: 3,
          retryDelay: 5000,
          failedAt: expect.any(String)
        },
        originalProperties: message.properties,
        originalFields: message.fields
      });
    });

    it('should handle message without properties and fields', async () => {
      const originalQueue = 'test-queue';
      const simpleMessage = { content: 'simple message' };

      await dlqHandler.handleFailedMessage(simpleMessage, originalQueue);

      expect(mockChannel.publish).toHaveBeenCalled();

      const publishCall = mockChannel.publish.mock.calls[0];
      const messageBuffer = publishCall[2] as Buffer;
      const parsedMessage = JSON.parse(messageBuffer.toString());

      expect(parsedMessage.dlqMetadata).toMatchObject({
        originalQueue: originalQueue,
        originalExchange: '',
        originalRoutingKey: '',
        retryCount: 1, // Should start at 1 when no previous retry count
        maxRetries: 3,
        retryDelay: 5000
      });
    });

    it('should handle message that is just content without wrapper', async () => {
      const originalQueue = 'test-queue';
      const directMessage = 'direct message content';

      await dlqHandler.handleFailedMessage(directMessage, originalQueue);

      expect(mockChannel.publish).toHaveBeenCalled();

      const publishCall = mockChannel.publish.mock.calls[0];
      const messageBuffer = publishCall[2] as Buffer;
      const parsedMessage = JSON.parse(messageBuffer.toString());

      expect(parsedMessage.originalMessage).toBe(directMessage);
    });

    it('should throw error when original queue name is missing', async () => {
      const message = { content: 'test' };

      await expect(dlqHandler.handleFailedMessage(message, '')).rejects.toThrow(
        'Original queue name is required for failed message handling'
      );
    });

    it('should throw error when message is missing', async () => {
      await expect(dlqHandler.handleFailedMessage(null, 'test-queue')).rejects.toThrow(
        'Message is required for failed message handling'
      );
    });

    it('should handle channel creation failure', async () => {
      const error = new Error('Channel creation failed');
      mockConnection.createChannel.mockRejectedValue(error);

      await expect(dlqHandler.handleFailedMessage({ content: 'test' }, 'test-queue')).rejects.toThrow(
        'Failed to route message to DLQ exchange \'test-queue.dlq\': Channel creation failed'
      );
    });

    it('should handle publish failure', async () => {
      // Reset the channel mock to ensure publish returns false
      mockChannel.publish.mockReturnValue(false);
      mockConnection.createChannel.mockResolvedValue(mockChannel);

      await expect(dlqHandler.handleFailedMessage({ content: 'test' }, 'test-queue')).rejects.toThrow(
        'Failed to publish message to DLQ - channel buffer full'
      );
    });

    it('should handle connection unavailable', async () => {
      mockConnectionManager.getConnection.mockReturnValue(null);

      await expect(dlqHandler.handleFailedMessage({ content: 'test' }, 'test-queue')).rejects.toThrow(
        'No active connection to RabbitMQ'
      );
    });
  });

  describe('DLQ Disabled Behavior', () => {
    let disabledDlqHandler: DLQHandler;

    beforeEach(() => {
      const disabledConfig = { ...mockConfig, dlq: { active: false } };
      disabledDlqHandler = new DLQHandler(disabledConfig, mockConnectionManager, mockResourceCreator);
    });

    it('should acknowledge failed message without routing when DLQ is disabled', async () => {
      const message = { content: 'test message' };
      const originalQueue = 'test-queue';

      // Should not throw and should complete successfully
      await expect(disabledDlqHandler.handleFailedMessage(message, originalQueue)).resolves.toBeUndefined();

      // Should not attempt to setup DLQ or route message
      expect(mockResourceCreator.ensureExchange).not.toHaveBeenCalled();
      expect(mockResourceCreator.ensureQueue).not.toHaveBeenCalled();
      expect(mockChannel.publish).not.toHaveBeenCalled();
    });

    it('should not setup DLQ when disabled', async () => {
      await expect(disabledDlqHandler.setupDLQ('test-queue')).rejects.toThrow(
        'DLQ is not enabled in configuration'
      );

      expect(mockResourceCreator.ensureExchange).not.toHaveBeenCalled();
      expect(mockResourceCreator.ensureQueue).not.toHaveBeenCalled();
    });
  });

  describe('Cache Management', () => {
    it('should clear cache and allow fresh setup', async () => {
      const originalQueue = 'test-queue';

      // First setup
      await dlqHandler.setupDLQ(originalQueue);
      expect(mockResourceCreator.ensureExchange).toHaveBeenCalledTimes(1);

      // Clear cache
      dlqHandler.clearCache();

      // Second setup should not use cache
      await dlqHandler.setupDLQ(originalQueue);
      expect(mockResourceCreator.ensureExchange).toHaveBeenCalledTimes(2);
    });

    it('should return cache statistics', () => {
      const stats = dlqHandler.getCacheStats();
      expect(stats).toEqual({ setupCache: 0 });
    });

    it('should update cache statistics after setup', async () => {
      await dlqHandler.setupDLQ('queue1');
      await dlqHandler.setupDLQ('queue2');

      const stats = dlqHandler.getCacheStats();
      expect(stats.setupCache).toBe(2);
    });
  });
});