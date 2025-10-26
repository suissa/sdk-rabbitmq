// amqplib types are used via ConnectionManager
import { IResourceCreator, QueueOptions, ExchangeOptions } from '../interfaces/IResource';
import { ConnectionManager } from './ConnectionManager';
import { Logger } from './Logger';
import { IConfiguration } from '../interfaces/IConfiguration';

/**
 * ResourceCreator handles automatic creation of exchanges, queues, and bindings
 * Implements caching and existence checking to avoid duplicate creation attempts
 */
export class ResourceCreator implements IResourceCreator {
  private connectionManager: ConnectionManager;
  private createdExchanges = new Set<string>();
  private createdQueues = new Set<string>();
  private createdBindings = new Set<string>();
  private existingExchanges = new Set<string>();
  private existingQueues = new Set<string>();
  private logger: Logger;

  constructor(connectionManager: ConnectionManager, config?: IConfiguration['logging']) {
    this.connectionManager = connectionManager;
    this.logger = Logger.createComponentLogger('ResourceCreator', config);
  }

  /**
   * Check if exchange exists without creating it
   * @param exchange Exchange name
   * @returns Promise<boolean> indicating if exchange exists
   */
  private async checkExchangeExists(exchange: string): Promise<boolean> {
    if (this.existingExchanges.has(exchange)) {
      return true;
    }

    return this.connectionManager.executeOperation(async () => {
      const connection = this.connectionManager.getConnection();
      if (!connection) {
        throw new Error('No active connection to RabbitMQ');
      }

      try {
        const channel = await (connection as any).createChannel();
        
        // Use checkExchange to verify existence without creating
        await channel.checkExchange(exchange);
        await channel.close();

        // Cache that exchange exists
        this.existingExchanges.add(exchange);
        return true;
      } catch (error) {
        // Exchange doesn't exist or other error
        return false;
      }
    });
  }

  /**
   * Check if queue exists without creating it
   * @param queue Queue name
   * @returns Promise<boolean> indicating if queue exists
   */
  private async checkQueueExists(queue: string): Promise<boolean> {
    if (this.existingQueues.has(queue)) {
      return true;
    }

    return this.connectionManager.executeOperation(async () => {
      const connection = this.connectionManager.getConnection();
      if (!connection) {
        throw new Error('No active connection to RabbitMQ');
      }

      try {
        const channel = await (connection as any).createChannel();
        
        // Use checkQueue to verify existence without creating
        await channel.checkQueue(queue);
        await channel.close();

        // Cache that queue exists
        this.existingQueues.add(queue);
        return true;
      } catch (error) {
        // Queue doesn't exist or other error
        return false;
      }
    });
  }

  /**
   * Ensure exchange exists, create if it doesn't
   * @param exchange Exchange name
   * @param type Exchange type (default: 'direct')
   * @param options Exchange options
   */
  public async ensureExchange(
    exchange: string, 
    type: string = 'topic', 
    options: ExchangeOptions = {}
  ): Promise<void> {
    if (!exchange) {
      throw new Error('Exchange name is required');
    }

    const exchangeKey = `${exchange}:${type}`;
    
    // Check cache first
    if (this.createdExchanges.has(exchangeKey)) {
      return;
    }

    // Check if exchange already exists
    try {
      const exists = await this.checkExchangeExists(exchange);
      if (exists) {
        this.createdExchanges.add(exchangeKey);
        this.logger.info(`Exchange already exists`, { exchange, type });
        return;
      }
    } catch (error) {
      this.logger.warn(`Could not check exchange existence`, { 
        exchange, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
    }

    return this.connectionManager.executeOperation(async () => {
      const connection = this.connectionManager.getConnection();
      if (!connection) {
        throw new Error('No active connection to RabbitMQ');
      }

      try {
        const channel = await (connection as any).createChannel();
        
        // Set default options
        const exchangeOptions = {
          durable: true,
          autoDelete: false,
          ...options
        };

        await channel.assertExchange(exchange, type, exchangeOptions);
        await channel.close();

        // Cache successful creation
        this.createdExchanges.add(exchangeKey);
        this.existingExchanges.add(exchange);
        
        this.logger.logOperation('createExchange', `Exchange created successfully`, {
          exchange,
          type,
          options: exchangeOptions
        });
      } catch (error) {
        this.logger.logError(`Failed to ensure exchange`, error as Error, { exchange, type });
        throw error;
      }
    });
  }

  /**
   * Ensure queue exists, create if it doesn't
   * @param queue Queue name
   * @param options Queue options
   */
  public async ensureQueue(queue: string, options: QueueOptions = {}): Promise<void> {
    if (!queue) {
      throw new Error('Queue name is required');
    }

    // Check cache first
    if (this.createdQueues.has(queue)) {
      return;
    }

    // Check if queue already exists
    try {
      const exists = await this.checkQueueExists(queue);
      if (exists) {
        this.createdQueues.add(queue);
        this.logger.info(`Queue already exists`, { queue });
        return;
      }
    } catch (error) {
      this.logger.warn(`Could not check queue existence`, { 
        queue, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
    }

    return this.connectionManager.executeOperation(async () => {
      const connection = this.connectionManager.getConnection();
      if (!connection) {
        throw new Error('No active connection to RabbitMQ');
      }

      try {
        const channel = await (connection as any).createChannel();
        
        // Set default options
        const queueOptions = {
          durable: true,
          exclusive: false,
          autoDelete: false,
          ...options
        };

        await channel.assertQueue(queue, queueOptions);
        await channel.close();

        // Cache successful creation
        this.createdQueues.add(queue);
        this.existingQueues.add(queue);
        
        this.logger.logOperation('createQueue', `Queue created successfully`, {
          queue,
          options: queueOptions
        });
      } catch (error) {
        this.logger.logError(`Failed to ensure queue`, error as Error, { queue });
        throw error;
      }
    });
  }

  /**
   * Bind queue to exchange with routing key
   * @param queue Queue name
   * @param exchange Exchange name
   * @param routingKey Routing key for binding
   */
  public async bindQueue(queue: string, exchange: string, routingKey: string): Promise<void> {
    if (!queue) {
      throw new Error('Queue name is required');
    }
    if (!exchange) {
      throw new Error('Exchange name is required');
    }
    if (!routingKey) {
      throw new Error('Routing key is required');
    }

    const bindingKey = `${queue}:${exchange}:${routingKey}`;
    
    // Check cache first
    if (this.createdBindings.has(bindingKey)) {
      return;
    }

    return this.connectionManager.executeOperation(async () => {
      const connection = this.connectionManager.getConnection();
      if (!connection) {
        throw new Error('No active connection to RabbitMQ');
      }

      try {
        const channel = await (connection as any).createChannel();
        
        await channel.bindQueue(queue, exchange, routingKey);
        await channel.close();

        // Cache successful binding
        this.createdBindings.add(bindingKey);
        
        this.logger.logOperation('bindQueue', `Queue bound to exchange successfully`, {
          queue,
          exchange,
          routingKey
        });
      } catch (error) {
        this.logger.logError(`Failed to bind queue to exchange`, error as Error, { 
          queue, 
          exchange, 
          routingKey 
        });
        throw error;
      }
    });
  }

  /**
   * Unbind queue from exchange with routing key
   * @param queue Queue name
   * @param exchange Exchange name
   * @param routingKey Routing key for unbinding
   */
  public async unbindQueue(queue: string, exchange: string, routingKey: string): Promise<void> {
    if (!queue) {
      throw new Error('Queue name is required');
    }
    if (!exchange) {
      throw new Error('Exchange name is required');
    }
    if (!routingKey) {
      throw new Error('Routing key is required');
    }

    const bindingKey = `${queue}:${exchange}:${routingKey}`;

    return this.connectionManager.executeOperation(async () => {
      const connection = this.connectionManager.getConnection();
      if (!connection) {
        throw new Error('No active connection to RabbitMQ');
      }

      try {
        const channel = await (connection as any).createChannel();
        
        await channel.unbindQueue(queue, exchange, routingKey);
        await channel.close();

        // Remove from cache if it exists
        this.createdBindings.delete(bindingKey);
        
        this.logger.logOperation('unbindQueue', `Queue unbound from exchange successfully`, {
          queue,
          exchange,
          routingKey
        });
      } catch (error) {
        this.logger.logError(`Failed to unbind queue from exchange`, error as Error, { 
          queue, 
          exchange, 
          routingKey 
        });
        throw error;
      }
    });
  }

  /**
   * Clear all caches (useful for testing or reset scenarios)
   */
  public clearCache(): void {
    this.createdExchanges.clear();
    this.createdQueues.clear();
    this.createdBindings.clear();
    this.existingExchanges.clear();
    this.existingQueues.clear();
    this.logger.info('ResourceCreator cache cleared');
  }

  /**
   * Get cache statistics for monitoring
   */
  public getCacheStats(): { 
    created: { exchanges: number; queues: number; bindings: number };
    existing: { exchanges: number; queues: number };
  } {
    return {
      created: {
        exchanges: this.createdExchanges.size,
        queues: this.createdQueues.size,
        bindings: this.createdBindings.size
      },
      existing: {
        exchanges: this.existingExchanges.size,
        queues: this.existingQueues.size
      }
    };
  }

  /**
   * Validate resource name format
   * @param name Resource name to validate
   * @param type Resource type for error messages
   */
  private validateResourceName(name: string, type: string): void {
    if (!name || typeof name !== 'string') {
      throw new Error(`${type} name must be a non-empty string`);
    }
    
    if (name.length > 255) {
      throw new Error(`${type} name cannot exceed 255 characters`);
    }
    
    // RabbitMQ naming conventions
    const invalidChars = /[^a-zA-Z0-9._-]/;
    if (invalidChars.test(name)) {
      throw new Error(`${type} name contains invalid characters. Only alphanumeric, dots, hyphens, and underscores are allowed`);
    }
  }

  /**
   * Enhanced ensure exchange with validation
   */
  public async ensureExchangeWithValidation(
    exchange: string, 
    type: string = 'topic', 
    options: ExchangeOptions = {}
  ): Promise<void> {
    this.validateResourceName(exchange, 'Exchange');
    
    const validTypes = ['direct', 'topic', 'fanout', 'headers'];
    if (!validTypes.includes(type)) {
      throw new Error(`Invalid exchange type '${type}'. Valid types: ${validTypes.join(', ')}`);
    }
    
    return this.ensureExchange(exchange, type, options);
  }

  /**
   * Enhanced ensure queue with validation
   */
  public async ensureQueueWithValidation(queue: string, options: QueueOptions = {}): Promise<void> {
    this.validateResourceName(queue, 'Queue');
    return this.ensureQueue(queue, options);
  }
}