import { ResourceCreator } from '../ResourceCreator';
import { ConnectionManager } from '../ConnectionManager';

// Mock amqplib
jest.mock('amqplib', () => ({}));

// Mock Logger
jest.mock('../Logger', () => ({
  Logger: {
    createComponentLogger: jest.fn(() => ({
      info: jest.fn(),
      warn: jest.fn(),
      logOperation: jest.fn(),
      logError: jest.fn()
    }))
  }
}));

describe('ResourceCreator', () => {
  let resourceCreator: ResourceCreator;
  let mockConnectionManager: jest.Mocked<ConnectionManager>;
  let mockChannel: any;
  let mockConnection: any;

  beforeEach(() => {
    // Create mock channel
    mockChannel = {
      assertExchange: jest.fn().mockResolvedValue(undefined),
      assertQueue: jest.fn().mockResolvedValue(undefined),
      bindQueue: jest.fn().mockResolvedValue(undefined),
      unbindQueue: jest.fn().mockResolvedValue(undefined),
      checkExchange: jest.fn().mockRejectedValue(new Error('Exchange does not exist')),
      checkQueue: jest.fn().mockRejectedValue(new Error('Queue does not exist')),
      close: jest.fn().mockResolvedValue(undefined)
    };

    // Create mock connection
    mockConnection = {
      createChannel: jest.fn().mockResolvedValue(mockChannel)
    };

    // Create mock ConnectionManager
    mockConnectionManager = {
      getConnection: jest.fn().mockReturnValue(mockConnection),
      executeOperation: jest.fn().mockImplementation((operation) => operation())
    } as any;

    resourceCreator = new ResourceCreator(mockConnectionManager);
  });

  afterEach(() => {
    jest.clearAllMocks();
    resourceCreator.clearCache();
  });

  describe('ensureExchange', () => {
    it('should create exchange with default type (direct)', async () => {
      await resourceCreator.ensureExchange('test-exchange');

      expect(mockConnectionManager.executeOperation).toHaveBeenCalled();
      expect(mockConnection.createChannel).toHaveBeenCalled();
      expect(mockChannel.assertExchange).toHaveBeenCalledWith(
        'test-exchange',
        'direct',
        { durable: true, autoDelete: false }
      );
      expect(mockChannel.close).toHaveBeenCalled();
    });

    it('should create exchange with topic type', async () => {
      await resourceCreator.ensureExchange('test-exchange', 'topic');

      expect(mockChannel.assertExchange).toHaveBeenCalledWith(
        'test-exchange',
        'topic',
        { durable: true, autoDelete: false }
      );
    });

    it('should create exchange with fanout type', async () => {
      await resourceCreator.ensureExchange('test-exchange', 'fanout');

      expect(mockChannel.assertExchange).toHaveBeenCalledWith(
        'test-exchange',
        'fanout',
        { durable: true, autoDelete: false }
      );
    });

    it('should create exchange with headers type', async () => {
      await resourceCreator.ensureExchange('test-exchange', 'headers');

      expect(mockChannel.assertExchange).toHaveBeenCalledWith(
        'test-exchange',
        'headers',
        { durable: true, autoDelete: false }
      );
    });

    it('should create exchange with custom options', async () => {
      const options = {
        durable: false,
        autoDelete: true,
        arguments: { 'x-message-ttl': 60000 }
      };

      await resourceCreator.ensureExchange('test-exchange', 'direct', options);

      expect(mockChannel.assertExchange).toHaveBeenCalledWith(
        'test-exchange',
        'direct',
        options
      );
    });

    it('should not create exchange if already cached', async () => {
      // First call
      await resourceCreator.ensureExchange('test-exchange');
      
      // Second call should use cache
      await resourceCreator.ensureExchange('test-exchange');

      expect(mockConnectionManager.executeOperation).toHaveBeenCalledTimes(2); // Once for existence check, once for creation
      expect(mockChannel.assertExchange).toHaveBeenCalledTimes(1);
    });

    it('should throw error for empty exchange name', async () => {
      await expect(resourceCreator.ensureExchange('')).rejects.toThrow('Exchange name is required');
    });

    it('should handle exchange creation failure', async () => {
      const error = new Error('Exchange creation failed');
      mockChannel.assertExchange.mockRejectedValue(error);

      await expect(resourceCreator.ensureExchange('test-exchange')).rejects.toThrow(error);
    });

    it('should skip creation if exchange already exists', async () => {
      // Mock that exchange exists (checkExchange succeeds)
      mockChannel.checkExchange.mockResolvedValueOnce(undefined);

      await resourceCreator.ensureExchange('existing-exchange');

      expect(mockChannel.checkExchange).toHaveBeenCalledWith('existing-exchange');
      expect(mockChannel.assertExchange).not.toHaveBeenCalled();
    });
  });

  describe('ensureQueue', () => {
    it('should create queue with default options', async () => {
      await resourceCreator.ensureQueue('test-queue');

      expect(mockConnectionManager.executeOperation).toHaveBeenCalled();
      expect(mockConnection.createChannel).toHaveBeenCalled();
      expect(mockChannel.assertQueue).toHaveBeenCalledWith(
        'test-queue',
        { durable: true, exclusive: false, autoDelete: false }
      );
      expect(mockChannel.close).toHaveBeenCalled();
    });

    it('should create queue with custom options', async () => {
      const options = {
        durable: false,
        exclusive: true,
        autoDelete: true,
        arguments: { 'x-max-length': 1000 }
      };

      await resourceCreator.ensureQueue('test-queue', options);

      expect(mockChannel.assertQueue).toHaveBeenCalledWith('test-queue', options);
    });

    it('should create queue with TTL argument', async () => {
      const options = {
        arguments: { 'x-message-ttl': 300000 }
      };

      await resourceCreator.ensureQueue('ttl-queue', options);

      expect(mockChannel.assertQueue).toHaveBeenCalledWith(
        'ttl-queue',
        { durable: true, exclusive: false, autoDelete: false, arguments: { 'x-message-ttl': 300000 } }
      );
    });

    it('should create queue with dead letter exchange', async () => {
      const options = {
        arguments: { 
          'x-dead-letter-exchange': 'dlx-exchange',
          'x-dead-letter-routing-key': 'failed'
        }
      };

      await resourceCreator.ensureQueue('dlq-queue', options);

      expect(mockChannel.assertQueue).toHaveBeenCalledWith(
        'dlq-queue',
        { 
          durable: true, 
          exclusive: false, 
          autoDelete: false, 
          arguments: { 
            'x-dead-letter-exchange': 'dlx-exchange',
            'x-dead-letter-routing-key': 'failed'
          } 
        }
      );
    });

    it('should not create queue if already cached', async () => {
      // First call
      await resourceCreator.ensureQueue('test-queue');
      
      // Second call should use cache
      await resourceCreator.ensureQueue('test-queue');

      expect(mockConnectionManager.executeOperation).toHaveBeenCalledTimes(2); // Once for existence check, once for creation
      expect(mockChannel.assertQueue).toHaveBeenCalledTimes(1);
    });

    it('should throw error for empty queue name', async () => {
      await expect(resourceCreator.ensureQueue('')).rejects.toThrow('Queue name is required');
    });

    it('should handle queue creation failure', async () => {
      const error = new Error('Queue creation failed');
      mockChannel.assertQueue.mockRejectedValue(error);

      await expect(resourceCreator.ensureQueue('test-queue')).rejects.toThrow(error);
    });

    it('should skip creation if queue already exists', async () => {
      // Mock that queue exists (checkQueue succeeds)
      mockChannel.checkQueue.mockResolvedValueOnce(undefined);

      await resourceCreator.ensureQueue('existing-queue');

      expect(mockChannel.checkQueue).toHaveBeenCalledWith('existing-queue');
      expect(mockChannel.assertQueue).not.toHaveBeenCalled();
    });
  });

  describe('bindQueue', () => {
    it('should bind queue to exchange with routing key', async () => {
      await resourceCreator.bindQueue('test-queue', 'test-exchange', 'test.routing.key');

      expect(mockConnectionManager.executeOperation).toHaveBeenCalled();
      expect(mockConnection.createChannel).toHaveBeenCalled();
      expect(mockChannel.bindQueue).toHaveBeenCalledWith(
        'test-queue',
        'test-exchange',
        'test.routing.key'
      );
      expect(mockChannel.close).toHaveBeenCalled();
    });

    it('should bind queue with wildcard routing key', async () => {
      await resourceCreator.bindQueue('test-queue', 'test-exchange', 'events.*');

      expect(mockChannel.bindQueue).toHaveBeenCalledWith(
        'test-queue',
        'test-exchange',
        'events.*'
      );
    });

    it('should bind queue with hash routing key for topic exchange', async () => {
      await resourceCreator.bindQueue('test-queue', 'topic-exchange', 'user.#');

      expect(mockChannel.bindQueue).toHaveBeenCalledWith(
        'test-queue',
        'topic-exchange',
        'user.#'
      );
    });

    it('should not create binding if already cached', async () => {
      // First call
      await resourceCreator.bindQueue('test-queue', 'test-exchange', 'test.key');
      
      // Second call should use cache
      await resourceCreator.bindQueue('test-queue', 'test-exchange', 'test.key');

      expect(mockConnectionManager.executeOperation).toHaveBeenCalledTimes(1);
      expect(mockChannel.bindQueue).toHaveBeenCalledTimes(1);
    });

    it('should throw error for empty queue name', async () => {
      await expect(
        resourceCreator.bindQueue('', 'test-exchange', 'test.key')
      ).rejects.toThrow('Queue name is required');
    });

    it('should throw error for empty exchange name', async () => {
      await expect(
        resourceCreator.bindQueue('test-queue', '', 'test.key')
      ).rejects.toThrow('Exchange name is required');
    });

    it('should throw error for empty routing key', async () => {
      await expect(
        resourceCreator.bindQueue('test-queue', 'test-exchange', '')
      ).rejects.toThrow('Routing key is required');
    });

    it('should handle binding failure', async () => {
      const error = new Error('Binding failed');
      mockChannel.bindQueue.mockRejectedValue(error);

      await expect(
        resourceCreator.bindQueue('test-queue', 'test-exchange', 'test.key')
      ).rejects.toThrow(error);
    });
  });

  describe('unbindQueue', () => {
    it('should unbind queue from exchange with routing key', async () => {
      await resourceCreator.unbindQueue('test-queue', 'test-exchange', 'test.routing.key');

      expect(mockConnectionManager.executeOperation).toHaveBeenCalled();
      expect(mockConnection.createChannel).toHaveBeenCalled();
      expect(mockChannel.unbindQueue).toHaveBeenCalledWith(
        'test-queue',
        'test-exchange',
        'test.routing.key'
      );
      expect(mockChannel.close).toHaveBeenCalled();
    });

    it('should remove binding from cache after unbinding', async () => {
      // First bind
      await resourceCreator.bindQueue('test-queue', 'test-exchange', 'test.key');
      
      // Then unbind
      await resourceCreator.unbindQueue('test-queue', 'test-exchange', 'test.key');

      // Binding again should call the operation (not use cache)
      await resourceCreator.bindQueue('test-queue', 'test-exchange', 'test.key');

      expect(mockConnectionManager.executeOperation).toHaveBeenCalledTimes(3);
      expect(mockChannel.bindQueue).toHaveBeenCalledTimes(2);
      expect(mockChannel.unbindQueue).toHaveBeenCalledTimes(1);
    });

    it('should throw error for empty queue name', async () => {
      await expect(
        resourceCreator.unbindQueue('', 'test-exchange', 'test.key')
      ).rejects.toThrow('Queue name is required');
    });

    it('should throw error for empty exchange name', async () => {
      await expect(
        resourceCreator.unbindQueue('test-queue', '', 'test.key')
      ).rejects.toThrow('Exchange name is required');
    });

    it('should throw error for empty routing key', async () => {
      await expect(
        resourceCreator.unbindQueue('test-queue', 'test-exchange', '')
      ).rejects.toThrow('Routing key is required');
    });

    it('should handle unbinding failure', async () => {
      const error = new Error('Unbinding failed');
      mockChannel.unbindQueue.mockRejectedValue(error);

      await expect(
        resourceCreator.unbindQueue('test-queue', 'test-exchange', 'test.key')
      ).rejects.toThrow(error);
    });
  });

  describe('validation methods', () => {
    it('should validate exchange with valid type using ensureExchangeWithValidation', async () => {
      await resourceCreator.ensureExchangeWithValidation('test-exchange', 'topic');

      expect(mockChannel.assertExchange).toHaveBeenCalledWith(
        'test-exchange',
        'topic',
        { durable: true, autoDelete: false }
      );
    });

    it('should throw error for invalid exchange type', async () => {
      await expect(
        resourceCreator.ensureExchangeWithValidation('test-exchange', 'invalid-type')
      ).rejects.toThrow("Invalid exchange type 'invalid-type'");
    });

    it('should throw error for invalid exchange name characters', async () => {
      await expect(
        resourceCreator.ensureExchangeWithValidation('test@exchange')
      ).rejects.toThrow('Exchange name contains invalid characters');
    });

    it('should throw error for exchange name too long', async () => {
      const longName = 'a'.repeat(256);
      await expect(
        resourceCreator.ensureExchangeWithValidation(longName)
      ).rejects.toThrow('Exchange name cannot exceed 255 characters');
    });

    it('should validate queue name using ensureQueueWithValidation', async () => {
      await resourceCreator.ensureQueueWithValidation('test-queue');

      expect(mockChannel.assertQueue).toHaveBeenCalledWith(
        'test-queue',
        { durable: true, exclusive: false, autoDelete: false }
      );
    });

    it('should throw error for invalid queue name characters', async () => {
      await expect(
        resourceCreator.ensureQueueWithValidation('test@queue')
      ).rejects.toThrow('Queue name contains invalid characters');
    });
  });

  describe('cache management', () => {
    it('should clear all caches', () => {
      // Create some cached entries first
      resourceCreator.ensureExchange('test-exchange');
      resourceCreator.ensureQueue('test-queue');
      
      resourceCreator.clearCache();
      
      const stats = resourceCreator.getCacheStats();
      expect(stats.created.exchanges).toBe(0);
      expect(stats.created.queues).toBe(0);
      expect(stats.created.bindings).toBe(0);
      expect(stats.existing.exchanges).toBe(0);
      expect(stats.existing.queues).toBe(0);
    });

    it('should return cache statistics', async () => {
      await resourceCreator.ensureExchange('test-exchange');
      await resourceCreator.ensureQueue('test-queue');
      await resourceCreator.bindQueue('test-queue', 'test-exchange', 'test.key');
      
      const stats = resourceCreator.getCacheStats();
      expect(stats.created.exchanges).toBe(1);
      expect(stats.created.queues).toBe(1);
      expect(stats.created.bindings).toBe(1);
    });
  });

  describe('error handling', () => {
    it('should handle connection manager errors', async () => {
      mockConnectionManager.getConnection.mockReturnValue(null);

      await expect(resourceCreator.ensureExchange('test-exchange')).rejects.toThrow(
        'No active connection to RabbitMQ'
      );
    });

    it('should handle channel creation errors', async () => {
      const error = new Error('Channel creation failed');
      mockConnection.createChannel.mockRejectedValue(error);

      await expect(resourceCreator.ensureExchange('test-exchange')).rejects.toThrow(error);
    });
  });
});