import { MessagePublisher } from '../MessagePublisher';
import { ConnectionManager } from '../ConnectionManager';
import { ResourceCreator } from '../ResourceCreator';
import { PublishError } from '../../interfaces/IErrors';
import { IConfiguration } from '../../interfaces/IConfiguration';

// Mock dependencies
jest.mock('../ConnectionManager', () => ({
  ConnectionManager: jest.fn(),
}));
jest.mock('../ResourceCreator', () => ({
  ResourceCreator: jest.fn(),
}));
jest.mock('../Logger', () => ({
  Logger: {
    createComponentLogger: jest.fn().mockReturnValue({
      logOperation: jest.fn(),
      logError: jest.fn(),
    }),
  },
}));

describe('MessagePublisher', () => {
  let messagePublisher: MessagePublisher;
  let mockConnectionManager: jest.Mocked<ConnectionManager>;
  let mockResourceCreator: jest.Mocked<ResourceCreator>;
  let mockChannel: any;
  let mockConnection: any;
  let config: IConfiguration['logging'];

  beforeEach(() => {
    // Setup mock channel
    mockChannel = {
      publish: jest.fn().mockReturnValue(true),
      close: jest.fn().mockResolvedValue(undefined),
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
    } as any;

    // Setup config
    config = {
      level: 'info',
      format: 'json',
    };

    // Create MessagePublisher instance
    messagePublisher = new MessagePublisher(mockConnectionManager, mockResourceCreator, config);

    // Reset all mocks
    jest.clearAllMocks();
  });

  describe('Parameter Validation', () => {
    it('should throw PublishError when exchange is empty string', async () => {
      await expect(
        messagePublisher.publish('', 'routing.key', { test: 'data' })
      ).rejects.toThrow(PublishError);
      
      await expect(
        messagePublisher.publish('', 'routing.key', { test: 'data' })
      ).rejects.toThrow('Exchange parameter is required and must be a non-empty string');
    });

    it('should throw PublishError when exchange is not a string', async () => {
      await expect(
        messagePublisher.publish(null as any, 'routing.key', { test: 'data' })
      ).rejects.toThrow(PublishError);
      
      await expect(
        messagePublisher.publish(123 as any, 'routing.key', { test: 'data' })
      ).rejects.toThrow(PublishError);
    });

    it('should throw PublishError when routingKey is empty string', async () => {
      await expect(
        messagePublisher.publish('test.exchange', '', { test: 'data' })
      ).rejects.toThrow(PublishError);
      
      await expect(
        messagePublisher.publish('test.exchange', '', { test: 'data' })
      ).rejects.toThrow('RoutingKey parameter is required and must be a non-empty string');
    });

    it('should throw PublishError when routingKey is not a string', async () => {
      await expect(
        messagePublisher.publish('test.exchange', null as any, { test: 'data' })
      ).rejects.toThrow(PublishError);
      
      await expect(
        messagePublisher.publish('test.exchange', 123 as any, { test: 'data' })
      ).rejects.toThrow(PublishError);
    });

    it('should throw PublishError when payload is null', async () => {
      await expect(
        messagePublisher.publish('test.exchange', 'routing.key', null)
      ).rejects.toThrow(PublishError);
      
      await expect(
        messagePublisher.publish('test.exchange', 'routing.key', null)
      ).rejects.toThrow('Payload parameter is required and cannot be null or undefined');
    });

    it('should throw PublishError when payload is undefined', async () => {
      await expect(
        messagePublisher.publish('test.exchange', 'routing.key', undefined)
      ).rejects.toThrow(PublishError);
      
      await expect(
        messagePublisher.publish('test.exchange', 'routing.key', undefined)
      ).rejects.toThrow('Payload parameter is required and cannot be null or undefined');
    });
  });

  describe('JSON Serialization', () => {
    it('should successfully serialize simple object payload', async () => {
      const payload = { message: 'test', id: 123 };
      
      const result = await messagePublisher.publish('test.exchange', 'routing.key', payload);
      
      expect(result).toBe(true);
      expect(mockChannel.publish).toHaveBeenCalledWith(
        'test.exchange',
        'routing.key',
        Buffer.from(JSON.stringify(payload)),
        expect.objectContaining({
          contentType: 'application/json',
          persistent: true,
        })
      );
    });

    it('should successfully serialize string payload', async () => {
      const payload = 'simple string message';
      
      const result = await messagePublisher.publish('test.exchange', 'routing.key', payload);
      
      expect(result).toBe(true);
      expect(mockChannel.publish).toHaveBeenCalledWith(
        'test.exchange',
        'routing.key',
        Buffer.from(JSON.stringify(payload)),
        expect.objectContaining({
          contentType: 'application/json',
        })
      );
    });

    it('should successfully serialize number payload', async () => {
      const payload = 42;
      
      const result = await messagePublisher.publish('test.exchange', 'routing.key', payload);
      
      expect(result).toBe(true);
      expect(mockChannel.publish).toHaveBeenCalledWith(
        'test.exchange',
        'routing.key',
        Buffer.from(JSON.stringify(payload)),
        expect.objectContaining({
          contentType: 'application/json',
        })
      );
    });

    it('should successfully serialize array payload', async () => {
      const payload = [1, 2, 3, 'test'];
      
      const result = await messagePublisher.publish('test.exchange', 'routing.key', payload);
      
      expect(result).toBe(true);
      expect(mockChannel.publish).toHaveBeenCalledWith(
        'test.exchange',
        'routing.key',
        Buffer.from(JSON.stringify(payload)),
        expect.objectContaining({
          contentType: 'application/json',
        })
      );
    });

    it('should return false when JSON serialization fails', async () => {
      // Create circular reference that cannot be serialized
      const payload: any = { name: 'test' };
      payload.self = payload;
      
      const result = await messagePublisher.publish('test.exchange', 'routing.key', payload);
      
      expect(result).toBe(false);
      expect(mockChannel.publish).not.toHaveBeenCalled();
    });
  });

  describe('Automatic Exchange Creation Integration', () => {
    it('should call ResourceCreator.ensureExchange before publishing', async () => {
      const payload = { test: 'data' };
      
      await messagePublisher.publish('test.exchange', 'routing.key', payload);
      
      expect(mockResourceCreator.ensureExchange).toHaveBeenCalledWith('test.exchange', 'direct');
      expect(mockResourceCreator.ensureExchange).toHaveBeenCalled();
      expect(mockChannel.publish).toHaveBeenCalled();
    });

    it('should return false when exchange creation fails', async () => {
      mockResourceCreator.ensureExchange.mockRejectedValue(new Error('Exchange creation failed'));
      
      const result = await messagePublisher.publish('test.exchange', 'routing.key', { test: 'data' });
      
      expect(result).toBe(false);
      expect(mockChannel.publish).not.toHaveBeenCalled();
    });

    it('should create exchange with direct type by default', async () => {
      await messagePublisher.publish('custom.exchange', 'routing.key', { test: 'data' });
      
      expect(mockResourceCreator.ensureExchange).toHaveBeenCalledWith('custom.exchange', 'direct');
    });
  });

  describe('Successful Message Publishing', () => {
    it('should publish message successfully and return true', async () => {
      const payload = { message: 'test message', timestamp: Date.now() };
      
      const result = await messagePublisher.publish('test.exchange', 'test.routing.key', payload);
      
      expect(result).toBe(true);
      expect(mockConnectionManager.executeOperation).toHaveBeenCalled();
      expect(mockConnectionManager.getConnection).toHaveBeenCalled();
      expect(mockConnection.createChannel).toHaveBeenCalled();
      expect(mockChannel.publish).toHaveBeenCalledWith(
        'test.exchange',
        'test.routing.key',
        Buffer.from(JSON.stringify(payload)),
        expect.objectContaining({
          contentType: 'application/json',
          timestamp: expect.any(Number),
          persistent: true,
        })
      );
      expect(mockChannel.close).toHaveBeenCalled();
    });

    it('should include timestamp in message properties', async () => {
      const payload = { test: 'data' };
      
      await messagePublisher.publish('test.exchange', 'routing.key', payload);
      
      expect(mockChannel.publish).toHaveBeenCalledWith(
        'test.exchange',
        'routing.key',
        expect.any(Buffer),
        expect.objectContaining({
          timestamp: expect.any(Number),
        })
      );
    });

    it('should set persistent flag to true for message durability', async () => {
      const payload = { test: 'data' };
      
      await messagePublisher.publish('test.exchange', 'routing.key', payload);
      
      expect(mockChannel.publish).toHaveBeenCalledWith(
        'test.exchange',
        'routing.key',
        expect.any(Buffer),
        expect.objectContaining({
          persistent: true,
        })
      );
    });
  });

  describe('Error Handling', () => {
    it('should return false when no connection is available', async () => {
      mockConnectionManager.getConnection.mockReturnValue(null);
      
      const result = await messagePublisher.publish('test.exchange', 'routing.key', { test: 'data' });
      
      expect(result).toBe(false);
      expect(mockChannel.publish).not.toHaveBeenCalled();
    });

    it('should return false when channel creation fails', async () => {
      mockConnection.createChannel.mockRejectedValue(new Error('Channel creation failed'));
      
      const result = await messagePublisher.publish('test.exchange', 'routing.key', { test: 'data' });
      
      expect(result).toBe(false);
    });

    it('should return false when publish operation fails', async () => {
      mockChannel.publish.mockImplementation(() => {
        throw new Error('Publish failed');
      });
      
      const result = await messagePublisher.publish('test.exchange', 'routing.key', { test: 'data' });
      
      expect(result).toBe(false);
      expect(mockChannel.close).toHaveBeenCalled();
    });

    it('should close channel even when publish fails', async () => {
      mockChannel.publish.mockImplementation(() => {
        throw new Error('Publish failed');
      });
      
      await messagePublisher.publish('test.exchange', 'routing.key', { test: 'data' });
      
      expect(mockChannel.close).toHaveBeenCalled();
    });

    it('should return false when executeOperation fails', async () => {
      mockConnectionManager.executeOperation.mockRejectedValue(new Error('Operation failed'));
      
      const result = await messagePublisher.publish('test.exchange', 'routing.key', { test: 'data' });
      
      expect(result).toBe(false);
    });
  });
});