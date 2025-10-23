import { IDLQHandler } from '../interfaces/IDLQ';
import { IConfiguration } from '../interfaces/IConfiguration';
import { ConnectionManager } from './ConnectionManager';
import { ResourceCreator } from './ResourceCreator';
import { Logger } from './Logger';

/**
 * DLQHandler manages Dead Letter Queue functionality
 * Handles DLQ setup, configuration, and failed message routing
 */
export class DLQHandler implements IDLQHandler {
  private config: IConfiguration;
  private connectionManager: ConnectionManager;
  private resourceCreator: ResourceCreator;
  private dlqSetupCache = new Set<string>();
  private logger: Logger;

  constructor(
    config: IConfiguration,
    connectionManager: ConnectionManager,
    resourceCreator: ResourceCreator
  ) {
    this.config = config;
    this.connectionManager = connectionManager;
    this.resourceCreator = resourceCreator;
    this.logger = Logger.createComponentLogger('DLQHandler', config.logging);
  }

  /**
   * Check if DLQ is enabled in configuration
   * @returns boolean indicating if DLQ is active
   */
  public isEnabled(): boolean {
    return this.config.dlq.active;
  }

  /**
   * Set up DLQ for a given original queue
   * Creates DLQ exchange and queue following naming conventions
   * @param originalQueue Original queue name
   * @returns Promise<string> DLQ queue name
   */
  public async setupDLQ(originalQueue: string): Promise<string> {
    if (!originalQueue) {
      throw new Error('Original queue name is required for DLQ setup');
    }

    if (!this.isEnabled()) {
      throw new Error('DLQ is not enabled in configuration');
    }

    // Check cache to avoid duplicate setup
    if (this.dlqSetupCache.has(originalQueue)) {
      return this.getDLQQueueName(originalQueue);
    }

    const dlqExchangeName = this.getDLQExchangeName(originalQueue);
    const dlqQueueName = this.getDLQQueueName(originalQueue);

    try {
      // Create DLQ exchange
      await this.resourceCreator.ensureExchange(dlqExchangeName, 'direct', {
        durable: true,
        autoDelete: false
      });

      // Create DLQ queue with TTL if configured
      const queueOptions: any = {
        durable: true,
        exclusive: false,
        autoDelete: false
      };

      // Add TTL if configured
      if (this.config.dlq.ttl && this.config.dlq.ttl > 0) {
        queueOptions.arguments = {
          'x-message-ttl': this.config.dlq.ttl
        };
      }

      await this.resourceCreator.ensureQueue(dlqQueueName, queueOptions);

      // Bind DLQ queue to DLQ exchange
      await this.resourceCreator.bindQueue(dlqQueueName, dlqExchangeName, originalQueue);

      // Cache successful setup
      this.dlqSetupCache.add(originalQueue);

      this.logger.logOperation('setupDLQ', `DLQ setup completed`, {
        originalQueue,
        dlqExchange: dlqExchangeName,
        dlqQueue: dlqQueueName,
        ttl: this.config.dlq.ttl
      });
      
      return dlqQueueName;
    } catch (error) {
      this.logger.logError(`Failed to setup DLQ`, error as Error, { originalQueue });
      throw error;
    }
  }

  /**
   * Handle a failed message by routing to DLQ
   * @param message Failed message object
   * @param originalQueue Original queue name where message failed
   */
  public async handleFailedMessage(message: any, originalQueue: string): Promise<void> {
    if (!originalQueue) {
      throw new Error('Original queue name is required for failed message handling');
    }

    if (!message) {
      throw new Error('Message is required for failed message handling');
    }

    if (!this.isEnabled()) {
      this.logger.info(`DLQ is disabled. Acknowledging failed message without reprocessing`, { 
        originalQueue 
      });
      return;
    }

    try {
      // Ensure DLQ is set up for this queue
      await this.setupDLQ(originalQueue);

      const dlqExchangeName = this.getDLQExchangeName(originalQueue);
      
      // Prepare message for DLQ with original metadata
      const dlqMessage = this.prepareDLQMessage(message, originalQueue);

      // Route message to DLQ
      await this.routeMessageToDLQ(dlqExchangeName, originalQueue, dlqMessage);

      this.logger.logOperation('routeToDLQ', `Failed message routed to DLQ`, { 
        originalQueue,
        dlqExchange: dlqExchangeName
      });
    } catch (error) {
      this.logger.logError(`Failed to handle failed message`, error as Error, { originalQueue });
      throw error;
    }
  }

  /**
   * Get DLQ exchange name following naming convention
   * @param originalQueue Original queue name
   * @returns DLQ exchange name (original-queue.dlq)
   */
  private getDLQExchangeName(originalQueue: string): string {
    return `${originalQueue}.dlq`;
  }

  /**
   * Get DLQ queue name following naming convention
   * @param originalQueue Original queue name
   * @returns DLQ queue name (original-queue.dlq)
   */
  private getDLQQueueName(originalQueue: string): string {
    return `${originalQueue}.dlq`;
  }

  /**
   * Prepare message for DLQ with original metadata
   * @param message Original message
   * @param originalQueue Original queue name
   * @returns Enhanced message with DLQ metadata
   */
  private prepareDLQMessage(message: any, originalQueue: string): any {
    const now = new Date();
    
    // Extract original message content and metadata
    const originalContent = message.content ? message.content : message;
    const originalProperties = message.properties || {};
    const originalFields = message.fields || {};

    return {
      originalMessage: originalContent,
      dlqMetadata: {
        originalQueue: originalQueue,
        originalExchange: originalFields.exchange || '',
        originalRoutingKey: originalFields.routingKey || '',
        failedAt: now.toISOString(),
        retryCount: this.getRetryCount(originalProperties) + 1,
        maxRetries: this.config.dlq.maxRetries || 3,
        retryDelay: this.config.dlq.retryDelay || 5000
      },
      originalProperties: originalProperties,
      originalFields: originalFields
    };
  }

  /**
   * Route message to DLQ exchange
   * @param dlqExchange DLQ exchange name
   * @param routingKey Routing key (original queue name)
   * @param message Message to route
   */
  private async routeMessageToDLQ(dlqExchange: string, routingKey: string, message: any): Promise<void> {
    return this.connectionManager.executeOperation(async () => {
      const connection = this.connectionManager.getConnection();
      if (!connection) {
        throw new Error('No active connection to RabbitMQ');
      }

      try {
        const channel = await (connection as any).createChannel();
        
        // Publish message to DLQ exchange
        const messageBuffer = Buffer.from(JSON.stringify(message));
        const publishOptions = {
          persistent: true,
          timestamp: Date.now(),
          headers: {
            'x-dlq-routed': true,
            'x-original-queue': routingKey
          }
        };

        const published = channel.publish(dlqExchange, routingKey, messageBuffer, publishOptions);
        
        if (!published) {
          throw new Error('Failed to publish message to DLQ - channel buffer full');
        }

        await channel.close();
      } catch (error) {
        const errorMessage = `Failed to route message to DLQ exchange '${dlqExchange}': ${error instanceof Error ? error.message : 'Unknown error'}`;
        throw new Error(errorMessage);
      }
    });
  }

  /**
   * Get retry count from message properties
   * @param properties Message properties
   * @returns Current retry count
   */
  private getRetryCount(properties: any): number {
    if (!properties || !properties.headers) {
      return 0;
    }

    return properties.headers['x-retry-count'] || 0;
  }

  /**
   * Clear DLQ setup cache (useful for testing)
   */
  public clearCache(): void {
    this.dlqSetupCache.clear();
    this.logger.info('DLQHandler cache cleared');
  }

  /**
   * Get cache statistics for monitoring
   */
  public getCacheStats(): { setupCache: number } {
    return {
      setupCache: this.dlqSetupCache.size
    };
  }

  /**
   * Get DLQ configuration
   */
  public getDLQConfig(): IConfiguration['dlq'] {
    return this.config.dlq;
  }
}