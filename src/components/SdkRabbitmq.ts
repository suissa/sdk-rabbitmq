import { ISdkRabbitmq } from '../interfaces/ISdkRabbitmq';
import { MessageCallback } from '../interfaces/IMessage';
import { ConfigurationManager } from './ConfigurationManager';
import { ConnectionManager } from './ConnectionManager';
import { MessagePublisher } from './MessagePublisher';
import { MessageSubscriber } from './MessageSubscriber';
import { ResourceCreator } from './ResourceCreator';
import { DLQHandler } from './DLQHandler';
import { Logger } from './Logger';
import { IConfiguration } from '../interfaces/IConfiguration';

/**
 * Main SdkRabbitmq singleton class that provides the public API
 * Implements singleton pattern to ensure single connection per application
 */
export class SdkRabbitmq implements ISdkRabbitmq {
  private static instance: SdkRabbitmq | null = null;
  private static isInitializing = false;
  
  private configurationManager: ConfigurationManager;
  private connectionManager!: ConnectionManager;
  private messagePublisher!: MessagePublisher;
  private messageSubscriber!: MessageSubscriber;
  private resourceCreator!: ResourceCreator;
  private dlqHandler!: DLQHandler;
  private logger: Logger;
  private config: IConfiguration;
  private isInitialized = false;

  /**
   * Private constructor to enforce singleton pattern
   */
  private constructor() {
    // Initialize configuration manager first
    this.configurationManager = ConfigurationManager.getInstance();
    
    // Load configuration
    this.config = this.configurationManager.loadConfig();
    
    // Initialize logger with configuration
    this.logger = Logger.createComponentLogger('SdkRabbitmq', this.config.logging);
    
    this.logger.info('SdkRabbitmq instance created', { 
      url: this.config.url,
      dlqActive: this.config.dlq.active 
    });
  }

  /**
   * Get singleton instance of SdkRabbitmq
   * Returns existing instance if available, creates new one otherwise
   */
  public static async getInstance(): Promise<SdkRabbitmq> {
    // Return existing instance if available and initialized
    if (SdkRabbitmq.instance && SdkRabbitmq.instance.isInitialized) {
      return SdkRabbitmq.instance;
    }

    // Prevent multiple simultaneous initialization attempts
    if (SdkRabbitmq.isInitializing) {
      // Wait for initialization to complete
      return new Promise<SdkRabbitmq>((resolve) => {
        const checkInitialization = () => {
          if (SdkRabbitmq.instance && SdkRabbitmq.instance.isInitialized && !SdkRabbitmq.isInitializing) {
            resolve(SdkRabbitmq.instance);
          } else {
            setTimeout(checkInitialization, 50);
          }
        };
        checkInitialization();
      });
    }

    SdkRabbitmq.isInitializing = true;

    try {
      // Create instance if it doesn't exist
      if (!SdkRabbitmq.instance) {
        SdkRabbitmq.instance = new SdkRabbitmq();
      }

      // Initialize all components
      await SdkRabbitmq.instance.initializeComponents();
      
      SdkRabbitmq.instance.isInitialized = true;
      SdkRabbitmq.isInitializing = false;
      
      return SdkRabbitmq.instance;
    } catch (error) {
      SdkRabbitmq.isInitializing = false;
      SdkRabbitmq.instance = null;
      throw error;
    }
  }

  /**
   * Initialize all SDK components and establish connection
   */
  private async initializeComponents(): Promise<void> {
    try {
      this.logger.info('Initializing SDK components');

      // Initialize connection manager
      this.connectionManager = ConnectionManager.getInstance(this.config);
      
      // Initialize resource creator
      this.resourceCreator = new ResourceCreator(this.connectionManager, this.config.logging);
      
      // Initialize DLQ handler
      this.dlqHandler = new DLQHandler(this.config, this.connectionManager, this.resourceCreator);
      
      // Initialize message publisher
      this.messagePublisher = new MessagePublisher(
        this.connectionManager, 
        this.resourceCreator, 
        this.config.logging
      );
      
      // Initialize message subscriber
      this.messageSubscriber = new MessageSubscriber(
        this.connectionManager, 
        this.resourceCreator, 
        this.dlqHandler, 
        this.config.logging
      );

      // Establish connection to RabbitMQ
      await this.connectionManager.connect();
      
      this.logger.info('SDK components initialized successfully');
    } catch (error) {
      this.logger.logError('Failed to initialize SDK components', error as Error);
      throw error;
    }
  }
  /**

   * Publish a message to an exchange
   * @param exchange Exchange name (required)
   * @param routingKey Routing key for message routing (required)
   * @param payload Message payload to be JSON serialized (required)
   * @returns Promise<boolean> - true for success, false for failure
   */
  public async publish(exchange: string, routingKey: string, payload: any): Promise<boolean> {
    // Parameter validation at API level
    this.validatePublishParameters(exchange, routingKey, payload);

    if (!this.isInitialized) {
      throw new Error('SDK is not initialized. Please wait for initialization to complete.');
    }

    try {
      this.logger.logOperation('publish', 'Publishing message', {
        exchange,
        routingKey,
        payloadType: typeof payload
      });

      // Delegate to MessagePublisher
      const result = await this.messagePublisher.publish(exchange, routingKey, payload);
      
      this.logger.logOperation('publish', 'Message published successfully', {
        exchange,
        routingKey,
        success: result
      });

      return result;
    } catch (error) {
      this.logger.logError('Failed to publish message', error as Error, {
        exchange,
        routingKey,
        payloadType: typeof payload
      });
      return false;
    }
  }

  /**
   * Subscribe to messages from a queue
   * @param exchange Exchange name (required)
   * @param queue Queue name (required)
   * @param routingKey Routing key for binding (required)
   * @param callback Message callback function (required)
   */
  public async subscribe(
    exchange: string,
    queue: string,
    routingKey: string,
    callback: MessageCallback
  ): Promise<void> {
    // Parameter validation at API level
    this.validateSubscribeParameters(exchange, queue, routingKey, callback);

    if (!this.isInitialized) {
      throw new Error('SDK is not initialized. Please wait for initialization to complete.');
    }

    try {
      this.logger.logOperation('subscribe', 'Setting up subscription', {
        exchange,
        queue,
        routingKey
      });

      // Delegate to MessageSubscriber
      await this.messageSubscriber.subscribe(exchange, queue, routingKey, callback);
      
      this.logger.logOperation('subscribe', 'Subscription established successfully', {
        exchange,
        queue,
        routingKey
      });
    } catch (error) {
      this.logger.logError('Failed to subscribe to messages', error as Error, {
        exchange,
        queue,
        routingKey
      });
      throw error;
    }
  }

  /**
   * Disconnect from RabbitMQ gracefully
   * Performs cleanup of all components and closes connection
   */
  public async disconnect(): Promise<void> {
    if (!this.isInitialized) {
      this.logger.warn('SDK is not initialized, nothing to disconnect');
      return;
    }

    try {
      this.logger.info('Starting graceful shutdown');

      // Cleanup message subscriber (unsubscribe from all queues)
      if (this.messageSubscriber) {
        await this.messageSubscriber.cleanup();
      }

      // Disconnect from RabbitMQ
      if (this.connectionManager) {
        await this.connectionManager.disconnect();
      }

      // Clear component caches
      if (this.resourceCreator) {
        this.resourceCreator.clearCache();
      }

      if (this.dlqHandler) {
        this.dlqHandler.clearCache();
      }

      // Reset initialization state
      this.isInitialized = false;

      this.logger.info('SDK disconnected successfully');
    } catch (error) {
      this.logger.logError('Error during disconnect', error as Error);
      throw error;
    }
  }

  /**
   * Validate publish method parameters
   * @param exchange Exchange name
   * @param routingKey Routing key
   * @param payload Message payload
   */
  private validatePublishParameters(exchange: string, routingKey: string, payload: any): void {
    if (!exchange || typeof exchange !== 'string') {
      throw new Error('Exchange parameter is required and must be a non-empty string');
    }

    if (!routingKey || typeof routingKey !== 'string') {
      throw new Error('RoutingKey parameter is required and must be a non-empty string');
    }

    if (payload === undefined || payload === null) {
      throw new Error('Payload parameter is required and cannot be null or undefined');
    }
  }

  /**
   * Validate subscribe method parameters
   * @param exchange Exchange name
   * @param queue Queue name
   * @param routingKey Routing key
   * @param callback Message callback function
   */
  private validateSubscribeParameters(
    exchange: string,
    queue: string,
    routingKey: string,
    callback: MessageCallback
  ): void {
    if (!exchange || typeof exchange !== 'string') {
      throw new Error('Exchange parameter is required and must be a non-empty string');
    }

    if (!queue || typeof queue !== 'string') {
      throw new Error('Queue parameter is required and must be a non-empty string');
    }

    if (!routingKey || typeof routingKey !== 'string') {
      throw new Error('RoutingKey parameter is required and must be a non-empty string');
    }

    if (!callback || typeof callback !== 'function') {
      throw new Error('Callback parameter is required and must be a function');
    }
  }

  /**
   * Get SDK initialization status
   */
  public isReady(): boolean {
    return this.isInitialized && this.connectionManager?.isConnected();
  }

  /**
   * Get active consumers for monitoring
   */
  public getActiveConsumers(): string[] {
    if (!this.messageSubscriber) {
      return [];
    }
    return this.messageSubscriber.getActiveConsumers();
  }

  /**
   * Reset singleton instance (for testing purposes)
   */
  public static resetInstance(): void {
    if (SdkRabbitmq.instance) {
      SdkRabbitmq.instance.disconnect().catch(() => {
        // Ignore errors during reset
      });
    }
    SdkRabbitmq.instance = null;
    SdkRabbitmq.isInitializing = false;
  }
}