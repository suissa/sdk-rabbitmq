import * as amqp from 'amqplib';
import { IConnectionManager } from '../interfaces/IConnection';
import { IConfiguration } from '../interfaces/IConfiguration';
import { Logger } from './Logger';

/**
 * Connection states for tracking connection status
 */
export enum ConnectionState {
  DISCONNECTED = 'disconnected',
  CONNECTING = 'connecting',
  CONNECTED = 'connected',
  RECONNECTING = 'reconnecting',
  FAILED = 'failed'
}

/**
 * ConnectionManager implements singleton pattern for RabbitMQ connections
 * Manages connection state and provides auto-reconnection capabilities
 */
export class ConnectionManager implements IConnectionManager {
  private static instance: ConnectionManager | null = null;
  private connection: amqp.Connection | null = null;
  private connectionState: ConnectionState = ConnectionState.DISCONNECTED;
  private config: IConfiguration;
  private connectionLostCallbacks: (() => void)[] = [];
  private operationQueue: (() => Promise<void>)[] = [];
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private baseRetryDelay = 1000; // 1 second
  private maxRetryDelay = 30000; // 30 seconds
  private reconnectTimer: NodeJS.Timeout | null = null;
  private logger: Logger;

  /**
   * Private constructor to enforce singleton pattern
   */
  private constructor(config: IConfiguration) {
    this.config = config;
    this.logger = Logger.createComponentLogger('ConnectionManager', config.logging);
  }

  /**
   * Get singleton instance of ConnectionManager
   */
  public static getInstance(config: IConfiguration): ConnectionManager {
    if (!ConnectionManager.instance) {
      ConnectionManager.instance = new ConnectionManager(config);
    }
    return ConnectionManager.instance;
  }

  /**
   * Establish connection to RabbitMQ
   */
  public async connect(): Promise<amqp.Connection> {
    if (this.connection && this.connectionState === ConnectionState.CONNECTED) {
      return this.connection;
    }

    if (this.connectionState === ConnectionState.CONNECTING || 
        this.connectionState === ConnectionState.RECONNECTING) {
      // Wait for existing connection attempt
      return new Promise<amqp.Connection>((resolve, reject) => {
        const checkConnection = () => {
          if (this.connection && this.connectionState === ConnectionState.CONNECTED) {
            resolve(this.connection);
          } else if (this.connectionState === ConnectionState.FAILED) {
            reject(new Error('Connection failed'));
          } else {
            setTimeout(checkConnection, 100);
          }
        };
        checkConnection();
      });
    }

    this.connectionState = ConnectionState.CONNECTING;

    try {
      this.connection = await amqp.connect(this.config.url) as unknown as amqp.Connection;
      this.connectionState = ConnectionState.CONNECTED;
      this.reconnectAttempts = 0;

      this.logger.logConnectionState(ConnectionState.CONNECTED, { url: this.config.url });

      // Set up connection event handlers
      this.setupConnectionEventHandlers();

      // Process queued operations
      await this.processQueuedOperations();

      return this.connection;
    } catch (error) {
      this.connectionState = ConnectionState.FAILED;
      this.logger.logError('Failed to connect to RabbitMQ', error as Error, { url: this.config.url });
      throw new Error(`Failed to connect to RabbitMQ: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get current connection instance
   */
  public getConnection(): amqp.Connection | null {
    return this.connection;
  }

  /**
   * Check if currently connected
   */
  public isConnected(): boolean {
    return this.connectionState === ConnectionState.CONNECTED && this.connection !== null;
  }

  /**
   * Disconnect from RabbitMQ
   */
  public async disconnect(): Promise<void> {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.connection) {
      try {
        await (this.connection as any).close();
      } catch (error) {
        // Ignore errors during disconnect
      }
      this.connection = null;
    }

    this.connectionState = ConnectionState.DISCONNECTED;
    this.reconnectAttempts = 0;
    this.operationQueue = [];
    
    this.logger.logConnectionState(ConnectionState.DISCONNECTED);
  }

  /**
   * Register callback for connection lost events
   */
  public onConnectionLost(callback: () => void): void {
    this.connectionLostCallbacks.push(callback);
  }

  /**
   * Get current connection state
   */
  public getConnectionState(): ConnectionState {
    return this.connectionState;
  }

  /**
   * Queue operation to be executed after reconnection
   */
  public queueOperation(operation: () => Promise<void>): void {
    if (this.connectionState === ConnectionState.RECONNECTING || 
        this.connectionState === ConnectionState.CONNECTING) {
      this.operationQueue.push(operation);
    } else if (this.connectionState === ConnectionState.CONNECTED) {
      // Execute immediately if connected
      operation().catch(error => {
        this.logger.logError('Error executing queued operation', error as Error);
      });
    } else {
      // Queue for later if disconnected
      this.operationQueue.push(operation);
    }
  }

  /**
   * Execute operation with automatic queuing during reconnection
   */
  public async executeOperation<T>(operation: () => Promise<T>): Promise<T> {
    if (this.connectionState === ConnectionState.CONNECTED && this.connection) {
      return await operation();
    }

    // Queue operation and wait for reconnection
    return new Promise<T>((resolve, reject) => {
      this.queueOperation(async () => {
        try {
          const result = await operation();
          resolve(result);
        } catch (error) {
          reject(error);
        }
      });
    });
  }

  /**
   * Set up event handlers for connection
   */
  private setupConnectionEventHandlers(): void {
    if (!this.connection) return;

    this.connection.on('error', (error: Error) => {
      this.logger.logError('RabbitMQ connection error', error);
      this.handleConnectionLoss();
    });

    this.connection.on('close', () => {
      this.logger.warn('RabbitMQ connection closed');
      this.handleConnectionLoss();
    });

    this.connection.on('blocked', (reason: string) => {
      this.logger.warn('RabbitMQ connection blocked', { reason });
    });

    this.connection.on('unblocked', () => {
      this.logger.info('RabbitMQ connection unblocked');
    });
  }

  /**
   * Handle connection loss and initiate reconnection
   */
  private handleConnectionLoss(): void {
    if (this.connectionState === ConnectionState.RECONNECTING || 
        this.connectionState === ConnectionState.DISCONNECTED) {
      return; // Already handling reconnection or intentionally disconnected
    }

    this.connection = null;
    this.connectionState = ConnectionState.RECONNECTING;

    this.logger.logConnectionState(ConnectionState.RECONNECTING, { 
      queuedOperations: this.operationQueue.length 
    });

    // Notify callbacks about connection loss
    this.connectionLostCallbacks.forEach(callback => {
      try {
        callback();
      } catch (error) {
        this.logger.logError('Error in connection lost callback', error as Error);
      }
    });

    // Start reconnection process
    this.startReconnection();
  }

  /**
   * Start reconnection process with exponential backoff
   * Implements exponential backoff: 1s, 2s, 4s, 8s, 16s, 30s (max)
   */
  private startReconnection(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      this.logger.error('Max reconnection attempts reached. Connection failed permanently.', {
        maxAttempts: this.maxReconnectAttempts,
        queuedOperations: this.operationQueue.length
      });
      this.connectionState = ConnectionState.FAILED;
      this.logger.logConnectionState(ConnectionState.FAILED);
      
      // Reject all queued operations
      this.operationQueue.forEach(operation => {
        operation().catch(() => {
          // Operations will fail, but we need to clear the queue
        });
      });
      this.operationQueue = [];
      return;
    }

    // Calculate exponential backoff delay: 1s, 2s, 4s, 8s, 16s, max 30s
    const delay = Math.min(
      this.baseRetryDelay * Math.pow(2, this.reconnectAttempts),
      this.maxRetryDelay
    );

    this.logger.info('Connection lost. Starting reconnection process', {
      queuedOperations: this.operationQueue.length,
      delayMs: delay,
      attempt: this.reconnectAttempts + 1,
      maxAttempts: this.maxReconnectAttempts
    });

    this.reconnectTimer = setTimeout(async () => {
      this.reconnectAttempts++;
      
      try {
        this.logger.logOperation('reconnect', `Attempting reconnection ${this.reconnectAttempts}/${this.maxReconnectAttempts}`);
        await this.connect();
        this.logger.info('Successfully reconnected to RabbitMQ', {
          queuedOperations: this.operationQueue.length,
          attempt: this.reconnectAttempts
        });
      } catch (error) {
        this.logger.logError(`Reconnection attempt ${this.reconnectAttempts} failed`, error as Error, {
          attempt: this.reconnectAttempts,
          maxAttempts: this.maxReconnectAttempts
        });
        this.startReconnection(); // Try again with increased delay
      }
    }, delay);
  }

  /**
   * Process operations that were queued during reconnection
   */
  private async processQueuedOperations(): Promise<void> {
    if (this.operationQueue.length === 0) {
      return;
    }

    this.logger.logOperation('processQueue', `Processing ${this.operationQueue.length} queued operations after reconnection`);
    
    const operations = [...this.operationQueue];
    this.operationQueue = [];

    let successCount = 0;
    let errorCount = 0;

    for (const operation of operations) {
      try {
        await operation();
        successCount++;
      } catch (error) {
        errorCount++;
        this.logger.logError('Error processing queued operation', error as Error);
      }
    }

    this.logger.info('Processed queued operations', {
      successful: successCount,
      failed: errorCount,
      total: operations.length
    });
  }

  /**
   * Reset singleton instance (for testing purposes)
   */
  public static resetInstance(): void {
    ConnectionManager.instance = null;
  }
}