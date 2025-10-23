import * as amqp from 'amqplib';
import { ConnectionManager, ConnectionState } from '../ConnectionManager';
import { IConfiguration } from '../../interfaces/IConfiguration';

// Mock amqplib
jest.mock('amqplib', () => ({
  connect: jest.fn(),
}));
const mockedAmqp = amqp as jest.Mocked<typeof amqp>;

// Mock Logger
jest.mock('../Logger', () => ({
  Logger: {
    createComponentLogger: jest.fn().mockReturnValue({
      logConnectionState: jest.fn(),
      logError: jest.fn(),
      logOperation: jest.fn(),
      warn: jest.fn(),
      info: jest.fn(),
      error: jest.fn(),
    }),
  },
}));

describe('ConnectionManager', () => {
  let mockConnection: any;
  let config: IConfiguration;

  beforeEach(() => {
    // Reset singleton instance before each test
    ConnectionManager.resetInstance();

    // Setup mock configuration
    config = {
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

    // Setup mock connection
    mockConnection = {
      on: jest.fn(),
      close: jest.fn().mockResolvedValue(undefined),
    };

    // Reset all mocks
    jest.clearAllMocks();
    jest.clearAllTimers();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
    ConnectionManager.resetInstance();
  });

  describe('Singleton Behavior', () => {
    it('should return the same instance when called multiple times', () => {
      const instance1 = ConnectionManager.getInstance(config);
      const instance2 = ConnectionManager.getInstance(config);
      const instance3 = ConnectionManager.getInstance(config);

      expect(instance1).toBe(instance2);
      expect(instance2).toBe(instance3);
      expect(instance1).toBe(instance3);
    });

    it('should maintain singleton behavior across different configurations', () => {
      const config1 = { ...config, url: 'amqp://localhost:5672' };
      const config2 = { ...config, url: 'amqp://localhost:5673' };

      const instance1 = ConnectionManager.getInstance(config1);
      const instance2 = ConnectionManager.getInstance(config2);

      expect(instance1).toBe(instance2);
    });

    it('should create new instance after reset', () => {
      const instance1 = ConnectionManager.getInstance(config);
      ConnectionManager.resetInstance();
      const instance2 = ConnectionManager.getInstance(config);

      expect(instance1).not.toBe(instance2);
    });
  });

  describe('Connection Management', () => {
    let connectionManager: ConnectionManager;

    beforeEach(() => {
      connectionManager = ConnectionManager.getInstance(config);
    });

    it('should establish connection successfully', async () => {
      mockedAmqp.connect.mockResolvedValue(mockConnection);

      const connection = await connectionManager.connect();

      expect(mockedAmqp.connect).toHaveBeenCalledWith(config.url);
      expect(connection).toBe(mockConnection);
      expect(connectionManager.isConnected()).toBe(true);
      expect(connectionManager.getConnection()).toBe(mockConnection);
    });

    it('should return existing connection if already connected', async () => {
      mockedAmqp.connect.mockResolvedValue(mockConnection);

      const connection1 = await connectionManager.connect();
      const connection2 = await connectionManager.connect();

      expect(mockedAmqp.connect).toHaveBeenCalledTimes(1);
      expect(connection1).toBe(connection2);
    });

    it('should handle connection failure', async () => {
      const error = new Error('Connection failed');
      mockedAmqp.connect.mockRejectedValue(error);

      await expect(connectionManager.connect()).rejects.toThrow('Failed to connect to RabbitMQ: Connection failed');
      expect(connectionManager.isConnected()).toBe(false);
      expect(connectionManager.getConnection()).toBe(null);
    });

    it('should disconnect properly', async () => {
      mockedAmqp.connect.mockResolvedValue(mockConnection);
      await connectionManager.connect();

      await connectionManager.disconnect();

      expect(mockConnection.close).toHaveBeenCalled();
      expect(connectionManager.isConnected()).toBe(false);
      expect(connectionManager.getConnection()).toBe(null);
    });
  });

  describe('Reconnection Logic', () => {
    let connectionManager: ConnectionManager;
    let connectionLostCallback: jest.Mock;

    beforeEach(() => {
      connectionManager = ConnectionManager.getInstance(config);
      connectionLostCallback = jest.fn();
      connectionManager.onConnectionLost(connectionLostCallback);
    });

    it('should handle connection loss and trigger reconnection', async () => {
      mockedAmqp.connect.mockResolvedValue(mockConnection);
      await connectionManager.connect();

      // Simulate connection loss
      const errorHandler = mockConnection.on.mock.calls.find((call: any) => call[0] === 'error')?.[1];
      expect(errorHandler).toBeDefined();

      // Trigger connection error
      errorHandler(new Error('Connection lost'));

      expect(connectionLostCallback).toHaveBeenCalled();
      expect(connectionManager.getConnectionState()).toBe(ConnectionState.RECONNECTING);
    });

    it('should implement exponential backoff for reconnection', async () => {
      mockedAmqp.connect
        .mockResolvedValueOnce(mockConnection) // Initial connection
        .mockRejectedValueOnce(new Error('Reconnect failed 1'))
        .mockRejectedValueOnce(new Error('Reconnect failed 2'))
        .mockResolvedValueOnce(mockConnection); // Successful reconnection

      await connectionManager.connect();

      // Simulate connection loss
      const errorHandler = mockConnection.on.mock.calls.find((call: any) => call[0] === 'error')?.[1];
      errorHandler(new Error('Connection lost'));

      // First reconnection attempt (1s delay)
      jest.advanceTimersByTime(1000);
      await Promise.resolve(); // Allow promises to resolve

      // Second reconnection attempt (2s delay)
      jest.advanceTimersByTime(2000);
      await Promise.resolve();

      // Third reconnection attempt (4s delay) - should succeed
      jest.advanceTimersByTime(4000);
      await Promise.resolve();

      expect(mockedAmqp.connect).toHaveBeenCalledTimes(4); // Initial + 3 reconnection attempts
    });

    it('should stop reconnection after max attempts', async () => {
      mockedAmqp.connect
        .mockResolvedValueOnce(mockConnection) // Initial connection
        .mockRejectedValue(new Error('Connection failed')); // All reconnection attempts fail

      await connectionManager.connect();

      // Simulate connection loss
      const errorHandler = mockConnection.on.mock.calls.find((call: any) => call[0] === 'error')?.[1];
      errorHandler(new Error('Connection lost'));

      // Advance through all reconnection attempts (10 attempts with exponential backoff)
      for (let i = 0; i < 10; i++) {
        const delay = Math.min(1000 * Math.pow(2, i), 30000);
        jest.advanceTimersByTime(delay);
        await Promise.resolve();
      }

      expect(connectionManager.getConnectionState()).toBe(ConnectionState.FAILED);
      expect(mockedAmqp.connect).toHaveBeenCalledTimes(11); // Initial + 10 reconnection attempts
    });
  });

  describe('Operation Queuing', () => {
    let connectionManager: ConnectionManager;

    beforeEach(() => {
      connectionManager = ConnectionManager.getInstance(config);
    });

    it('should queue operations during reconnection', async () => {
      mockedAmqp.connect.mockResolvedValue(mockConnection);
      await connectionManager.connect();

      // Simulate connection loss
      const errorHandler = mockConnection.on.mock.calls.find((call: any) => call[0] === 'error')?.[1];
      errorHandler(new Error('Connection lost'));

      const operation1 = jest.fn().mockResolvedValue('result1');
      const operation2 = jest.fn().mockResolvedValue('result2');

      // Queue operations during reconnection
      connectionManager.queueOperation(operation1);
      connectionManager.queueOperation(operation2);

      // Operations should not be executed yet
      expect(operation1).not.toHaveBeenCalled();
      expect(operation2).not.toHaveBeenCalled();

      // Simulate successful reconnection
      mockedAmqp.connect.mockResolvedValue(mockConnection);
      jest.advanceTimersByTime(1000);
      await Promise.resolve();

      // Operations should be executed after reconnection
      expect(operation1).toHaveBeenCalled();
      expect(operation2).toHaveBeenCalled();
    });

    it('should execute operations immediately when connected', async () => {
      mockedAmqp.connect.mockResolvedValue(mockConnection);
      await connectionManager.connect();

      const operation = jest.fn().mockResolvedValue('result');
      connectionManager.queueOperation(operation);

      // Operation should be executed immediately
      await Promise.resolve();
      expect(operation).toHaveBeenCalled();
    });

    it('should handle operation execution with executeOperation method', async () => {
      mockedAmqp.connect.mockResolvedValue(mockConnection);
      await connectionManager.connect();

      const operation = jest.fn().mockResolvedValue('test-result');
      const result = await connectionManager.executeOperation(operation);

      expect(operation).toHaveBeenCalled();
      expect(result).toBe('test-result');
    });

    it('should queue executeOperation calls during reconnection', async () => {
      mockedAmqp.connect.mockResolvedValue(mockConnection);
      await connectionManager.connect();

      // Simulate connection loss
      const errorHandler = mockConnection.on.mock.calls.find((call: any) => call[0] === 'error')?.[1];
      errorHandler(new Error('Connection lost'));

      const operation = jest.fn().mockResolvedValue('queued-result');
      const resultPromise = connectionManager.executeOperation(operation);

      // Operation should not be executed yet
      expect(operation).not.toHaveBeenCalled();

      // Simulate successful reconnection
      mockedAmqp.connect.mockResolvedValue(mockConnection);
      jest.advanceTimersByTime(1000);
      await Promise.resolve();

      const result = await resultPromise;
      expect(operation).toHaveBeenCalled();
      expect(result).toBe('queued-result');
    });

    it('should handle errors in queued operations', async () => {
      mockedAmqp.connect.mockResolvedValue(mockConnection);
      await connectionManager.connect();

      // Simulate connection loss
      const errorHandler = mockConnection.on.mock.calls.find((call: any) => call[0] === 'error')?.[1];
      errorHandler(new Error('Connection lost'));

      const failingOperation = jest.fn().mockRejectedValue(new Error('Operation failed'));
      const successfulOperation = jest.fn().mockResolvedValue('success');

      connectionManager.queueOperation(failingOperation);
      connectionManager.queueOperation(successfulOperation);

      // Simulate successful reconnection
      mockedAmqp.connect.mockResolvedValue(mockConnection);
      jest.advanceTimersByTime(1000);
      await Promise.resolve();

      // Both operations should be attempted
      expect(failingOperation).toHaveBeenCalled();
      expect(successfulOperation).toHaveBeenCalled();
    });
  });

  describe('Connection Event Handling', () => {
    let connectionManager: ConnectionManager;

    beforeEach(() => {
      connectionManager = ConnectionManager.getInstance(config);
    });

    it('should set up event handlers on connection', async () => {
      mockedAmqp.connect.mockResolvedValue(mockConnection);
      await connectionManager.connect();

      expect(mockConnection.on).toHaveBeenCalledWith('error', expect.any(Function));
      expect(mockConnection.on).toHaveBeenCalledWith('close', expect.any(Function));
      expect(mockConnection.on).toHaveBeenCalledWith('blocked', expect.any(Function));
      expect(mockConnection.on).toHaveBeenCalledWith('unblocked', expect.any(Function));
    });

    it('should handle connection close event', async () => {
      mockedAmqp.connect.mockResolvedValue(mockConnection);
      await connectionManager.connect();

      const closeHandler = mockConnection.on.mock.calls.find((call: any) => call[0] === 'close')?.[1];
      expect(closeHandler).toBeDefined();

      closeHandler();

      expect(connectionManager.getConnectionState()).toBe(ConnectionState.RECONNECTING);
    });

    it('should handle blocked and unblocked events', async () => {
      mockedAmqp.connect.mockResolvedValue(mockConnection);
      await connectionManager.connect();

      const blockedHandler = mockConnection.on.mock.calls.find((call: any) => call[0] === 'blocked')?.[1];
      const unblockedHandler = mockConnection.on.mock.calls.find((call: any) => call[0] === 'unblocked')?.[1];

      expect(blockedHandler).toBeDefined();
      expect(unblockedHandler).toBeDefined();

      // These should not throw errors
      blockedHandler('Memory alarm');
      unblockedHandler();
    });
  });
});