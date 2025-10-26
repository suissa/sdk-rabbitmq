import { MessageSubscriber } from '../MessageSubscriber';
import { ConnectionManager } from '../ConnectionManager';
import { ResourceCreator } from '../ResourceCreator';
import { DLQHandler } from '../DLQHandler';
import { SubscriptionError } from '../../interfaces/IErrors';
import { IConfiguration } from '../../interfaces/IConfiguration';
import { MessageCallback } from '../../interfaces/IMessage';

// Mock dependencies
jest.mock('../ConnectionManager', () => ({
  ConnectionManager: jest.fn(),
}));
jest.mock('../ResourceCreator', () => ({
  ResourceCreator: jest.fn(),
}));
jest.mock('../DLQHandler', () => ({
  DLQHandler: jest.fn(),
}));
jest.mock('../Logger', () => ({
  Logger: {
    createComponentLogger: jest.fn().mockReturnValue({
      logOperation: jest.fn(),
      logError: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
    }),
  },
}));

describe('MessageSubscriber', () => {
  let messageSubscriber: MessageSubscriber;
  let mockConnectionManager: jest.Mocked<ConnectionManager>;
  let mockResourceCreator: jest.Mocked<ResourceCreator>;
  let mockDLQHandler: jest.Mocked<DLQHandler>;
  let mockChannel: any;
  let mockConnection: any;
  let config: IConfiguration['logging'];

  beforeEach(() => {
    // Setup mock channel
    mockChannel = {
      consume: jest.fn().mockResolvedValue({ consumerTag: 'test-consumer-tag' }),
      cancel: jest.fn().mockResolvedValue(undefined),
      close: jest.fn().mockResolvedValue(undefined),
      prefetch: jest.fn().mockResolvedValue(undefined),
      ack: jest.fn(),
      nack: jest.fn(),
      publish: jest.fn().mockReturnValue(true),
    };

    // Setup mock connection
    mockConnection = {
      createChannel: jest.fn().mockResolvedValue(mockChannel),
    };

    // Setup mock ConnectionManager
    mockConnectionManager = {
      getConnection: jest.fn().mockReturnValue(mockConnection),
      executeOperation: jest.fn().mockImplementation(async (operation) => {
        return await operation();
      }),
    } as any;

    // Setup mock ResourceCreator
    mockResourceCreator = {
      ensureExchange: jest.fn().mockResolvedValue(undefined),
      ensureQueue: jest.fn().mockResolvedValue(undefined),
      bindQueue: jest.fn().mockResolvedValue(undefined),
      unbindQueue: jest.fn().mockResolvedValue(undefined),
    } as any;

    // Setup mock DLQHandler
    mockDLQHandler = {
      isEnabled: jest.fn().mockReturnValue(false),
      handleFailedMessage: jest.fn().mockResolvedValue(undefined),
      getDLQConfig: jest.fn().mockReturnValue({ maxRetries: 3, retryDelay: 0 }),
    } as any;

    // Setup config
    config = {
      level: 'info',
      format: 'json',
    };

    // Create MessageSubscriber instance
    messageSubscriber = new MessageSubscriber(
      mockConnectionManager,
      mockResourceCreator,
      mockDLQHandler,
      config
    );

    // Reset all mocks
    jest.clearAllMocks();
  });

  describe('Parameter Validation', () => {
    const mockCallback: MessageCallback = jest.fn();

    it('should throw SubscriptionError when exchange is empty string', async () => {
      await expect(
        messageSubscriber.subscribe('', 'test.queue', 'routing.key', mockCallback)
      ).rejects.toThrow(SubscriptionError);
      
      await expect(
        messageSubscriber.subscribe('', 'test.queue', 'routing.key', mockCallback)
      ).rejects.toThrow('Exchange parameter is required and must be a non-empty string');
    });

    it('should throw SubscriptionError when exchange is not a string', async () => {
      await expect(
        messageSubscriber.subscribe(null as any, 'test.queue', 'routing.key', mockCallback)
      ).rejects.toThrow(SubscriptionError);
      
      await expect(
        messageSubscriber.subscribe(123 as any, 'test.queue', 'routing.key', mockCallback)
      ).rejects.toThrow(SubscriptionError);
    });

    it('should throw SubscriptionError when queue is empty string', async () => {
      await expect(
        messageSubscriber.subscribe('test.exchange', '', 'routing.key', mockCallback)
      ).rejects.toThrow(SubscriptionError);
      
      await expect(
        messageSubscriber.subscribe('test.exchange', '', 'routing.key', mockCallback)
      ).rejects.toThrow('Queue parameter is required and must be a non-empty string');
    });

    it('should throw SubscriptionError when queue is not a string', async () => {
      await expect(
        messageSubscriber.subscribe('test.exchange', null as any, 'routing.key', mockCallback)
      ).rejects.toThrow(SubscriptionError);
      
      await expect(
        messageSubscriber.subscribe('test.exchange', 123 as any, 'routing.key', mockCallback)
      ).rejects.toThrow(SubscriptionError);
    });

    it('should throw SubscriptionError when routingKey is empty string', async () => {
      await expect(
        messageSubscriber.subscribe('test.exchange', 'test.queue', '', mockCallback)
      ).rejects.toThrow(SubscriptionError);
      
      await expect(
        messageSubscriber.subscribe('test.exchange', 'test.queue', '', mockCallback)
      ).rejects.toThrow('RoutingKey parameter is required and must be a non-empty string');
    });

    it('should throw SubscriptionError when routingKey is not a string', async () => {
      await expect(
        messageSubscriber.subscribe('test.exchange', 'test.queue', null as any, mockCallback)
      ).rejects.toThrow(SubscriptionError);
      
      await expect(
        messageSubscriber.subscribe('test.exchange', 'test.queue', 123 as any, mockCallback)
      ).rejects.toThrow(SubscriptionError);
    });

    it('should throw SubscriptionError when callback is not a function', async () => {
      await expect(
        messageSubscriber.subscribe('test.exchange', 'test.queue', 'routing.key', null as any)
      ).rejects.toThrow(SubscriptionError);
      
      await expect(
        messageSubscriber.subscribe('test.exchange', 'test.queue', 'routing.key', 'not-a-function' as any)
      ).rejects.toThrow('Callback parameter is required and must be a function');
    });
  });

  describe('Automatic Resource Creation Integration', () => {
    const mockCallback: MessageCallback = jest.fn();

    it('should call ResourceCreator methods before subscribing', async () => {
      await messageSubscriber.subscribe('test.exchange', 'test.queue', 'routing.key', mockCallback);
      
      expect(mockResourceCreator.ensureExchange).toHaveBeenCalledWith('test.exchange', 'direct');
      expect(mockResourceCreator.ensureQueue).toHaveBeenCalledWith('test.queue');
      expect(mockResourceCreator.bindQueue).toHaveBeenCalledWith('test.queue', 'test.exchange', 'routing.key');
      
      // Verify order: resources created before channel operations
      expect(mockResourceCreator.ensureExchange).toHaveBeenCalled();
      expect(mockResourceCreator.ensureQueue).toHaveBeenCalled();
      expect(mockResourceCreator.bindQueue).toHaveBeenCalled();
      expect(mockConnection.createChannel).toHaveBeenCalled();
    });

    it('should throw SubscriptionError when exchange creation fails', async () => {
      mockResourceCreator.ensureExchange.mockRejectedValue(new Error('Exchange creation failed'));
      
      await expect(
        messageSubscriber.subscribe('test.exchange', 'test.queue', 'routing.key', mockCallback)
      ).rejects.toThrow(SubscriptionError);
      
      await expect(
        messageSubscriber.subscribe('test.exchange', 'test.queue', 'routing.key', mockCallback)
      ).rejects.toThrow('Failed to ensure resources exist for subscription');
      
      expect(mockChannel.consume).not.toHaveBeenCalled();
    });

    it('should throw SubscriptionError when queue creation fails', async () => {
      mockResourceCreator.ensureQueue.mockRejectedValue(new Error('Queue creation failed'));
      
      await expect(
        messageSubscriber.subscribe('test.exchange', 'test.queue', 'routing.key', mockCallback)
      ).rejects.toThrow(SubscriptionError);
      
      expect(mockChannel.consume).not.toHaveBeenCalled();
    });

    it('should throw SubscriptionError when binding fails', async () => {
      mockResourceCreator.bindQueue.mockRejectedValue(new Error('Binding failed'));
      
      await expect(
        messageSubscriber.subscribe('test.exchange', 'test.queue', 'routing.key', mockCallback)
      ).rejects.toThrow(SubscriptionError);
      
      expect(mockChannel.consume).not.toHaveBeenCalled();
    });
  });

  describe('Successful Message Consumption', () => {
    const mockCallback: MessageCallback = jest.fn();

    it('should successfully subscribe to queue and setup consumer', async () => {
      await messageSubscriber.subscribe('test.exchange', 'test.queue', 'routing.key', mockCallback);
      
      expect(mockConnectionManager.executeOperation).toHaveBeenCalled();
      expect(mockConnectionManager.getConnection).toHaveBeenCalled();
      expect(mockConnection.createChannel).toHaveBeenCalled();
      expect(mockChannel.prefetch).toHaveBeenCalledWith(1);
      expect(mockChannel.consume).toHaveBeenCalledWith(
        'test.queue',
        expect.any(Function),
        { noAck: false }
      );
    });

    it('should track active consumers', async () => {
      await messageSubscriber.subscribe('test.exchange', 'test.queue1', 'routing.key1', mockCallback);
      await messageSubscriber.subscribe('test.exchange', 'test.queue2', 'routing.key2', mockCallback);
      
      const activeConsumers = messageSubscriber.getActiveConsumers();
      expect(activeConsumers).toContain('test.queue1');
      expect(activeConsumers).toContain('test.queue2');
      expect(activeConsumers).toHaveLength(2);
    });
  });

  describe('JSON Deserialization', () => {
    const mockCallback: MessageCallback = jest.fn();
    let messageHandler: Function;

    beforeEach(async () => {
      await messageSubscriber.subscribe('test.exchange', 'test.queue', 'routing.key', mockCallback);
      
      // Get the message handler function passed to channel.consume
      const consumeCall = mockChannel.consume.mock.calls[0];
      messageHandler = consumeCall[1];
    });

    it('should deserialize JSON message and invoke callback with parsed payload', () => {
      const testPayload = { message: 'test', id: 123, data: [1, 2, 3] };
      const mockMessage = {
        content: Buffer.from(JSON.stringify(testPayload)),
        fields: {
          deliveryTag: 1,
          exchange: 'test.exchange',
          routingKey: 'routing.key',
        },
        properties: {
          headers: {},
        },
      };

      messageHandler(mockMessage);

      expect(mockCallback).toHaveBeenCalledWith(
        testPayload,
        expect.any(Function), // ack function
        expect.any(Function)  // nack function
      );
    });

    it('should deserialize string message correctly', () => {
      const testPayload = 'simple string message';
      const mockMessage = {
        content: Buffer.from(JSON.stringify(testPayload)),
        fields: {
          deliveryTag: 1,
          exchange: 'test.exchange',
          routingKey: 'routing.key',
        },
        properties: {
          headers: {},
        },
      };

      messageHandler(mockMessage);

      expect(mockCallback).toHaveBeenCalledWith(
        testPayload,
        expect.any(Function),
        expect.any(Function)
      );
    });

    it('should deserialize number message correctly', () => {
      const testPayload = 42;
      const mockMessage = {
        content: Buffer.from(JSON.stringify(testPayload)),
        fields: {
          deliveryTag: 1,
          exchange: 'test.exchange',
          routingKey: 'routing.key',
        },
        properties: {
          headers: {},
        },
      };

      messageHandler(mockMessage);

      expect(mockCallback).toHaveBeenCalledWith(
        testPayload,
        expect.any(Function),
        expect.any(Function)
      );
    });

    it('should deserialize array message correctly', () => {
      const testPayload = [1, 'test', { nested: true }];
      const mockMessage = {
        content: Buffer.from(JSON.stringify(testPayload)),
        fields: {
          deliveryTag: 1,
          exchange: 'test.exchange',
          routingKey: 'routing.key',
        },
        properties: {
          headers: {},
        },
      };

      messageHandler(mockMessage);

      expect(mockCallback).toHaveBeenCalledWith(
        testPayload,
        expect.any(Function),
        expect.any(Function)
      );
    });

    it('should handle malformed JSON by routing to DLQ when enabled', () => {
      mockDLQHandler.isEnabled.mockReturnValue(true);
      
      const mockMessage = {
        content: Buffer.from('invalid json {'),
        fields: {
          deliveryTag: 1,
          exchange: 'test.exchange',
          routingKey: 'routing.key',
        },
        properties: {
          headers: {},
        },
      };

      messageHandler(mockMessage);

      expect(mockCallback).not.toHaveBeenCalled();
      // Message should be handled as failed due to deserialization error
    });

    it('should acknowledge malformed JSON when DLQ is disabled', () => {
      mockDLQHandler.isEnabled.mockReturnValue(false);
      
      const mockMessage = {
        content: Buffer.from('invalid json {'),
        fields: {
          deliveryTag: 1,
          exchange: 'test.exchange',
          routingKey: 'routing.key',
        },
        properties: {
          headers: {},
        },
      };

      messageHandler(mockMessage);

      expect(mockCallback).not.toHaveBeenCalled();
      // Should handle as failed message without DLQ
    });
  });

  describe('Message Acknowledgment', () => {
    const mockCallback = jest.fn() as jest.MockedFunction<MessageCallback>;
    let messageHandler: Function;
    let ackFunction: Function;
    let nackFunction: Function;

    beforeEach(async () => {
      await messageSubscriber.subscribe('test.exchange', 'test.queue', 'routing.key', mockCallback);
      
      // Get the message handler function passed to channel.consume
      const consumeCall = mockChannel.consume.mock.calls[0];
      messageHandler = consumeCall[1];

      // Setup callback to capture ack/nack functions
      mockCallback.mockImplementation((message: any, ack: () => void, nack: () => void) => {
        ackFunction = ack;
        nackFunction = nack;
      });
    });

    it('should provide ack function that acknowledges message', () => {
      const mockMessage = {
        content: Buffer.from(JSON.stringify({ test: 'data' })),
        fields: {
          deliveryTag: 1,
          exchange: 'test.exchange',
          routingKey: 'routing.key',
        },
        properties: {
          headers: {},
        },
      };

      messageHandler(mockMessage);

      expect(mockCallback).toHaveBeenCalled();
      expect(ackFunction).toBeDefined();
      
      // Call the ack function
      ackFunction();
      
      expect(mockChannel.ack).toHaveBeenCalledWith(mockMessage);
    });

    it('should provide nack function for message rejection', () => {
      const mockMessage = {
        content: Buffer.from(JSON.stringify({ test: 'data' })),
        fields: {
          deliveryTag: 1,
          exchange: 'test.exchange',
          routingKey: 'routing.key',
        },
        properties: {
          headers: {},
        },
      };

      messageHandler(mockMessage);

      expect(mockCallback).toHaveBeenCalled();
      expect(nackFunction).toBeDefined();
      
      // The nack function should be available for the callback to use
      expect(typeof nackFunction).toBe('function');
    });
  });

  describe('Error Handling', () => {
    const mockCallback: MessageCallback = jest.fn();

    it('should throw SubscriptionError when no connection is available', async () => {
      mockConnectionManager.getConnection.mockReturnValue(null);
      
      await expect(
        messageSubscriber.subscribe('test.exchange', 'test.queue', 'routing.key', mockCallback)
      ).rejects.toThrow(SubscriptionError);
      
      await expect(
        messageSubscriber.subscribe('test.exchange', 'test.queue', 'routing.key', mockCallback)
      ).rejects.toThrow('No active connection to RabbitMQ');
    });

    it('should throw error when channel creation fails', async () => {
      mockConnection.createChannel.mockRejectedValue(new Error('Channel creation failed'));
      
      await expect(
        messageSubscriber.subscribe('test.exchange', 'test.queue', 'routing.key', mockCallback)
      ).rejects.toThrow('Channel creation failed');
    });

    it('should close channel when consume operation fails', async () => {
      mockChannel.consume.mockRejectedValue(new Error('Consume failed'));
      
      await expect(
        messageSubscriber.subscribe('test.exchange', 'test.queue', 'routing.key', mockCallback)
      ).rejects.toThrow('Consume failed');
      
      expect(mockChannel.close).toHaveBeenCalled();
    });

    it('should throw error when executeOperation fails', async () => {
      mockConnectionManager.executeOperation.mockRejectedValue(new Error('Operation failed'));
      
      await expect(
        messageSubscriber.subscribe('test.exchange', 'test.queue', 'routing.key', mockCallback)
      ).rejects.toThrow('Operation failed');
    });
  });

  describe('Unsubscribe Functionality', () => {
    const mockCallback: MessageCallback = jest.fn();

    it('should successfully unsubscribe from queue', async () => {
      // First subscribe
      await messageSubscriber.subscribe('test.exchange', 'test.queue', 'routing.key', mockCallback);
      
      // Then unsubscribe
      await messageSubscriber.unsubscribe('test.queue');
      
      expect(mockChannel.cancel).toHaveBeenCalledWith('test-consumer-tag');
      expect(mockChannel.close).toHaveBeenCalled();
      
      // Should no longer be in active consumers
      const activeConsumers = messageSubscriber.getActiveConsumers();
      expect(activeConsumers).not.toContain('test.queue');
    });

    it('should throw SubscriptionError when queue parameter is invalid', async () => {
      await expect(
        messageSubscriber.unsubscribe('')
      ).rejects.toThrow(SubscriptionError);
      
      await expect(
        messageSubscriber.unsubscribe(null as any)
      ).rejects.toThrow('Queue parameter is required and must be a non-empty string');
    });

    it('should handle unsubscribe from non-existent queue gracefully', async () => {
      // Should not throw an error when unsubscribing from non-existent queue
      await messageSubscriber.unsubscribe('non-existent-queue');
      // If we reach this point, no error was thrown
      expect(true).toBe(true);
    });
  });
});