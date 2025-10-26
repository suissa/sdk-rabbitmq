import { SdkRabbitmq } from '../SdkRabbitmq';
import { MessageCallback } from '../../interfaces/IMessage';
import * as fs from 'fs';
import * as path from 'path';

// Mock amqplib for integration tests
jest.mock('amqplib', () => ({
  connect: jest.fn(),
}));

describe('SdkRabbitmq Integration Tests', () => {
  let mockConnection: any;
  let mockChannel: any;
  let configPath: string;

  beforeAll(() => {
    // Setup test configuration file
    configPath = path.join(process.cwd(), 'config.json');
    const testConfig = {
      url: 'amqp://localhost:5672',
      dlq: {
        active: true,
        ttl: 300000,
        maxRetries: 3,
        retryDelay: 5000
      },
      logging: {
        level: 'error', // Reduce log noise in tests
        format: 'json'
      }
    };
    
    fs.writeFileSync(configPath, JSON.stringify(testConfig, null, 2));
  });

  beforeEach(() => {
    // Reset singleton instance before each test
    SdkRabbitmq.resetInstance();

    // Setup mock connection and channel
    mockChannel = {
      assertExchange: jest.fn().mockResolvedValue({}),
      assertQueue: jest.fn().mockResolvedValue({ queue: 'test-queue' }),
      bindQueue: jest.fn().mockResolvedValue({}),
      unbindQueue: jest.fn().mockResolvedValue({}),
      publish: jest.fn().mockReturnValue(true),
      consume: jest.fn().mockResolvedValue({ consumerTag: 'test-consumer' }),
      prefetch: jest.fn().mockResolvedValue({}),
      ack: jest.fn(),
      nack: jest.fn(),
      cancel: jest.fn().mockResolvedValue({}),
      close: jest.fn().mockResolvedValue({}),
      on: jest.fn(),
      removeAllListeners: jest.fn(),
    };

    mockConnection = {
      createChannel: jest.fn().mockResolvedValue(mockChannel),
      close: jest.fn().mockResolvedValue({}),
      on: jest.fn(),
      removeAllListeners: jest.fn(),
    };

    const amqplib = require('amqplib');
    amqplib.connect.mockClear();
    amqplib.connect.mockResolvedValue(mockConnection);
  });

  afterEach(() => {
    // Clean up singleton instance
    SdkRabbitmq.resetInstance();
  });

  afterAll(() => {
    // Clean up test configuration file
    if (fs.existsSync(configPath)) {
      fs.unlinkSync(configPath);
    }
  });

  describe('Singleton Behavior', () => {
    it('should return the same instance across multiple instantiations', async () => {
      // Test requirement 2.1: Singleton pattern implementation
      const instance1 = await SdkRabbitmq.getInstance();
      const instance2 = await SdkRabbitmq.getInstance();
      const instance3 = await SdkRabbitmq.getInstance();

      expect(instance1).toBe(instance2);
      expect(instance2).toBe(instance3);
      expect(instance1).toBe(instance3);
    });

    it('should maintain singleton behavior during concurrent instantiation attempts', async () => {
      // Test concurrent access to singleton
      const promises = Array.from({ length: 5 }, () => SdkRabbitmq.getInstance());
      const instances = await Promise.all(promises);

      // All instances should be the same object
      const firstInstance = instances[0];
      instances.forEach(instance => {
        expect(instance).toBe(firstInstance);
      });
    });

    it('should share state between multiple references to singleton', async () => {
      const instance1 = await SdkRabbitmq.getInstance();
      const instance2 = await SdkRabbitmq.getInstance();

      // Both instances should report the same ready state
      expect(instance1.isReady()).toBe(instance2.isReady());
      
      // Both instances should have the same active consumers
      expect(instance1.getActiveConsumers()).toEqual(instance2.getActiveConsumers());
    });

    it('should create new instance after reset', async () => {
      const instance1 = await SdkRabbitmq.getInstance();
      
      SdkRabbitmq.resetInstance();
      
      const instance2 = await SdkRabbitmq.getInstance();
      expect(instance2).not.toBe(instance1);
    });
  });

  describe('End-to-End Publish and Subscribe Workflows', () => {
    let sdkInstance: SdkRabbitmq;

    beforeEach(async () => {
      sdkInstance = await SdkRabbitmq.getInstance();
    });

    it('should successfully publish a message end-to-end', async () => {
      // Test requirement 3.1: Message publishing functionality
      const exchange = 'test-exchange';
      const routingKey = 'test.route';
      const payload = { message: 'Hello World', timestamp: Date.now() };

      const result = await sdkInstance.publish(exchange, routingKey, payload);

      expect(result).toBe(true);
      expect(mockChannel.assertExchange).toHaveBeenCalledWith(
        exchange,
        'direct',
        { durable: true, autoDelete: false }
      );
      expect(mockChannel.publish).toHaveBeenCalledWith(
        exchange,
        routingKey,
        expect.any(Buffer),
        expect.objectContaining({ 
          persistent: true,
          contentType: 'application/json'
        })
      );
    });

    it('should successfully set up subscription end-to-end', async () => {
      // Test requirement 4.1: Message subscription functionality
      const exchange = 'test-exchange';
      const queue = 'test-queue';
      const routingKey = 'test.route';
      const callback: MessageCallback = jest.fn();

      await sdkInstance.subscribe(exchange, queue, routingKey, callback);

      expect(mockChannel.assertExchange).toHaveBeenCalledWith(
        exchange,
        'direct',
        { durable: true, autoDelete: false }
      );
      expect(mockChannel.assertQueue).toHaveBeenCalledWith(
        queue,
        { durable: true, exclusive: false, autoDelete: false }
      );
      expect(mockChannel.bindQueue).toHaveBeenCalledWith(
        queue,
        exchange,
        routingKey
      );
      expect(mockChannel.consume).toHaveBeenCalledWith(
        queue,
        expect.any(Function),
        { noAck: false }
      );
    });

    it('should handle complete publish-subscribe workflow', async () => {
      const exchange = 'workflow-exchange';
      const queue = 'workflow-queue';
      const routingKey = 'workflow.test';
      const testPayload = { id: 1, data: 'test-data' };
      
      let receivedMessage: any = null;
      const callback: MessageCallback = (message, ack) => {
        receivedMessage = message;
        ack();
      };

      // Set up subscription first
      await sdkInstance.subscribe(exchange, queue, routingKey, callback);

      // Publish message
      const publishResult = await sdkInstance.publish(exchange, routingKey, testPayload);
      expect(publishResult).toBe(true);

      // Simulate message consumption
      const consumeHandler = mockChannel.consume.mock.calls[0][1];
      const mockMessage = {
        content: Buffer.from(JSON.stringify(testPayload)),
        fields: {
          deliveryTag: 1,
          redelivered: false,
          exchange: exchange,
          routingKey: routingKey
        },
        properties: {
          contentType: 'application/json',
          timestamp: Date.now(),
          messageId: 'test-message-id',
          headers: {}
        }
      };

      consumeHandler(mockMessage);

      expect(receivedMessage).toEqual(testPayload);
      expect(mockChannel.ack).toHaveBeenCalledWith(mockMessage);
    });

    it('should handle multiple concurrent operations', async () => {
      const operations = [
        sdkInstance.publish('exchange1', 'route1', { data: 'message1' }),
        sdkInstance.publish('exchange2', 'route2', { data: 'message2' }),
        sdkInstance.subscribe('exchange3', 'queue3', 'route3', jest.fn()),
        sdkInstance.subscribe('exchange4', 'queue4', 'route4', jest.fn()),
      ];

      const results = await Promise.all(operations);

      // First two operations are publish (should return boolean)
      expect(results[0]).toBe(true);
      expect(results[1]).toBe(true);
      
      // Last two operations are subscribe (should return void)
      expect(results[2]).toBeUndefined();
      expect(results[3]).toBeUndefined();

      // Verify all operations were executed
      expect(mockChannel.publish).toHaveBeenCalledTimes(2);
      expect(mockChannel.consume).toHaveBeenCalledTimes(2);
    });
  });

  describe('Error Scenarios and Recovery', () => {
    it('should handle connection failures during initialization', async () => {
      // Reset and setup connection failure
      SdkRabbitmq.resetInstance();
      const amqplib = require('amqplib');
      
      // Clear previous mock calls and set up failure
      amqplib.connect.mockClear();
      amqplib.connect.mockRejectedValueOnce(new Error('Connection failed'));

      await expect(SdkRabbitmq.getInstance()).rejects.toThrow('Failed to connect to RabbitMQ: Connection failed');
    });

    it('should handle publish failures gracefully', async () => {
      const sdkInstance = await SdkRabbitmq.getInstance();
      mockChannel.publish.mockReturnValueOnce(false);

      const result = await sdkInstance.publish('test-exchange', 'test.route', { data: 'test' });

      expect(result).toBe(false);
    });

    it('should handle publish errors gracefully', async () => {
      const sdkInstance = await SdkRabbitmq.getInstance();
      mockChannel.publish.mockImplementationOnce(() => {
        throw new Error('Publish error');
      });

      const result = await sdkInstance.publish('test-exchange', 'test.route', { data: 'test' });

      expect(result).toBe(false);
    });

    it('should validate required parameters for publish', async () => {
      const sdkInstance = await SdkRabbitmq.getInstance();

      await expect(
        sdkInstance.publish('', 'route', { data: 'test' })
      ).rejects.toThrow('Exchange parameter is required and must be a non-empty string');

      await expect(
        sdkInstance.publish('exchange', '', { data: 'test' })
      ).rejects.toThrow('RoutingKey parameter is required and must be a non-empty string');

      await expect(
        sdkInstance.publish('exchange', 'route', null)
      ).rejects.toThrow('Payload parameter is required and cannot be null or undefined');
    });

    it('should validate required parameters for subscribe', async () => {
      const sdkInstance = await SdkRabbitmq.getInstance();
      const callback: MessageCallback = jest.fn();

      await expect(
        sdkInstance.subscribe('', 'queue', 'route', callback)
      ).rejects.toThrow('Exchange parameter is required and must be a non-empty string');

      await expect(
        sdkInstance.subscribe('exchange', '', 'route', callback)
      ).rejects.toThrow('Queue parameter is required and must be a non-empty string');

      await expect(
        sdkInstance.subscribe('exchange', 'queue', '', callback)
      ).rejects.toThrow('RoutingKey parameter is required and must be a non-empty string');

      await expect(
        sdkInstance.subscribe('exchange', 'queue', 'route', null as any)
      ).rejects.toThrow('Callback parameter is required and must be a function');
    });

    it('should handle graceful disconnect', async () => {
      const sdkInstance = await SdkRabbitmq.getInstance();
      
      await sdkInstance.disconnect();

      expect(sdkInstance.isReady()).toBe(false);
    });
  });

  describe('Queue Binding Management', () => {
    it('should bind queue to exchange successfully', async () => {
      const sdkInstance = await SdkRabbitmq.getInstance();
      
      await sdkInstance.bind('test-queue', 'test-exchange', 'test.route');

      expect(mockChannel.bindQueue).toHaveBeenCalledWith(
        'test-queue',
        'test-exchange', 
        'test.route'
      );
    });

    it('should unbind queue from exchange successfully', async () => {
      const sdkInstance = await SdkRabbitmq.getInstance();
      
      await sdkInstance.unbind('test-queue', 'test-exchange', 'test.route');

      expect(mockChannel.unbindQueue).toHaveBeenCalledWith(
        'test-queue',
        'test-exchange',
        'test.route'
      );
    });

    it('should validate required parameters for bind', async () => {
      const sdkInstance = await SdkRabbitmq.getInstance();

      await expect(
        sdkInstance.bind('', 'exchange', 'route')
      ).rejects.toThrow('Queue parameter is required and must be a non-empty string');

      await expect(
        sdkInstance.bind('queue', '', 'route')
      ).rejects.toThrow('Exchange parameter is required and must be a non-empty string');

      await expect(
        sdkInstance.bind('queue', 'exchange', '')
      ).rejects.toThrow('RoutingKey parameter is required and must be a non-empty string');
    });

    it('should validate required parameters for unbind', async () => {
      const sdkInstance = await SdkRabbitmq.getInstance();

      await expect(
        sdkInstance.unbind('', 'exchange', 'route')
      ).rejects.toThrow('Queue parameter is required and must be a non-empty string');

      await expect(
        sdkInstance.unbind('queue', '', 'route')
      ).rejects.toThrow('Exchange parameter is required and must be a non-empty string');

      await expect(
        sdkInstance.unbind('queue', 'exchange', '')
      ).rejects.toThrow('RoutingKey parameter is required and must be a non-empty string');
    });

    it('should handle bind errors gracefully', async () => {
      const sdkInstance = await SdkRabbitmq.getInstance();
      const error = new Error('Bind failed');
      mockChannel.bindQueue.mockRejectedValue(error);

      await expect(
        sdkInstance.bind('queue', 'exchange', 'route')
      ).rejects.toThrow('Bind failed');
    });

    it('should handle unbind errors gracefully', async () => {
      const sdkInstance = await SdkRabbitmq.getInstance();
      const error = new Error('Unbind failed');
      mockChannel.unbindQueue.mockRejectedValue(error);

      await expect(
        sdkInstance.unbind('queue', 'exchange', 'route')
      ).rejects.toThrow('Unbind failed');
    });
  });

  describe('SDK State Management', () => {
    it('should report correct ready state', async () => {
      const sdkInstance = await SdkRabbitmq.getInstance();
      
      expect(sdkInstance.isReady()).toBe(true);
    });

    it('should track active consumers', async () => {
      const sdkInstance = await SdkRabbitmq.getInstance();
      
      expect(sdkInstance.getActiveConsumers()).toEqual([]);

      await sdkInstance.subscribe('exchange1', 'queue1', 'route1', jest.fn());
      await sdkInstance.subscribe('exchange2', 'queue2', 'route2', jest.fn());

      const activeConsumers = sdkInstance.getActiveConsumers();
      expect(activeConsumers).toHaveLength(2);
      expect(activeConsumers).toContain('queue1');
      expect(activeConsumers).toContain('queue2');
    });
  });
});