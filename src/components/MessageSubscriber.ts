import * as amqp from 'amqplib';
import { IMessageSubscriber, MessageCallback } from '../interfaces/IMessage';
import { SubscriptionError } from '../interfaces/IErrors';
import { ConnectionManager } from './ConnectionManager';
import { ResourceCreator } from './ResourceCreator';
import { DLQHandler } from './DLQHandler';
import { Logger } from './Logger';
import { IConfiguration } from '../interfaces/IConfiguration';

/**
 * MessageSubscriber handles message consumption from RabbitMQ queues
 * Implements parameter validation, JSON deserialization, automatic resource creation, and DLQ handling
 */
export class MessageSubscriber implements IMessageSubscriber {
  private connectionManager: ConnectionManager;
  private resourceCreator: ResourceCreator;
  private dlqHandler: DLQHandler;
  private activeConsumers = new Map<string, { channel: amqp.Channel; consumerTag: string }>();
  private logger: Logger;

  constructor(connectionManager: ConnectionManager, resourceCreator: ResourceCreator, dlqHandler: DLQHandler, config?: IConfiguration['logging']) {
    this.connectionManager = connectionManager;
    this.resourceCreator = resourceCreator;
    this.dlqHandler = dlqHandler;
    this.logger = Logger.createComponentLogger('MessageSubscriber', config);
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
    // Parameter validation - all parameters are required
    this.validateSubscribeParameters(exchange, queue, routingKey, callback);

    try {
      // Automatic exchange and queue creation before subscribing
      await this.ensureResourcesExist(exchange, queue, routingKey);

      await this.connectionManager.executeOperation(async () => {
        const connection = this.connectionManager.getConnection();
        if (!connection) {
          throw new SubscriptionError('No active connection to RabbitMQ', {
            exchange,
            queue,
            routingKey
          });
        }

        // Create a dedicated channel for this consumer
        const channel = await (connection as any).createChannel();
        
        try {
          // Set prefetch to 1 for fair dispatch
          await channel.prefetch(1);

          // Start consuming messages
          const consumerInfo = await channel.consume(
            queue,
            (message: amqp.ConsumeMessage | null) => {
              if (message) {
                // Add queue name to message headers for DLQ handling
                if (!message.properties.headers) {
                  message.properties.headers = {};
                }
                message.properties.headers['x-original-queue'] = queue;
                
                this.handleMessage(message, callback, channel);
              }
            },
            {
              noAck: false // We want manual acknowledgment
            }
          );

          // Store consumer info for cleanup
          this.activeConsumers.set(queue, {
            channel,
            consumerTag: consumerInfo.consumerTag
          });

          this.logger.logOperation('subscribe', `Successfully subscribed to queue`, {
            queue,
            exchange,
            routingKey
          });
        } catch (error) {
          // Close channel on error
          await channel.close();
          throw error;
        }
      });
    } catch (error) {
      // Detailed error logging with context
      this.logSubscriptionError(error, exchange, queue, routingKey);
      throw error;
    }
  }

  /**
   * Unsubscribe from a queue
   * @param queue Queue name to unsubscribe from
   */
  public async unsubscribe(queue: string): Promise<void> {
    if (!queue || typeof queue !== 'string') {
      throw new SubscriptionError('Queue parameter is required and must be a non-empty string', {
        queue
      });
    }

    const consumerInfo = this.activeConsumers.get(queue);
    if (!consumerInfo) {
      this.logger.warn(`No active subscription found for queue`, { queue });
      return;
    }

    try {
      // Cancel the consumer
      await consumerInfo.channel.cancel(consumerInfo.consumerTag);
      
      // Close the channel
      await consumerInfo.channel.close();
      
      // Remove from active consumers
      this.activeConsumers.delete(queue);
      
      this.logger.logOperation('unsubscribe', `Successfully unsubscribed from queue`, { queue });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.logError(`Error unsubscribing from queue`, error as Error, { queue });
      
      // Still remove from active consumers even if cleanup failed
      this.activeConsumers.delete(queue);
      
      throw new SubscriptionError(`Failed to unsubscribe from queue '${queue}'`, {
        queue,
        error: errorMessage
      });
    }
  }

  /**
   * Handle incoming message
   * @param message RabbitMQ message
   * @param callback User callback function
   * @param channel Channel for acknowledgment
   */
  private handleMessage(
    message: amqp.ConsumeMessage,
    callback: MessageCallback,
    channel: amqp.Channel
  ): void {
    const queueName = this.getQueueNameFromMessage(message);
    
    try {
      // JSON deserialization for incoming messages
      const deserializedPayload = this.deserializeMessage(message);

      // Create ack/nack functions for callback
      const ack = (): void => {
        try {
          channel.ack(message);
        } catch (error) {
          this.logger.logError('Error acknowledging message', error as Error, {
            deliveryTag: message.fields.deliveryTag,
            queue: queueName
          });
        }
      };

      const nack = async (): Promise<void> => {
        try {
          await this.handleFailedMessage(message, queueName, channel);
        } catch (error) {
          this.logger.logError('Error handling failed message', error as Error, {
            deliveryTag: message.fields.deliveryTag,
            queue: queueName
          });
          // Fallback to regular nack with requeue
          try {
            channel.nack(message, false, true);
          } catch (nackError) {
            this.logger.logError('Error negative acknowledging message', nackError as Error, {
              deliveryTag: message.fields.deliveryTag,
              queue: queueName
            });
          }
        }
      };

      // Invoke callback with deserialized payload and ack/nack functions
      callback(deserializedPayload, ack, nack);

    } catch (error) {
      this.logger.logError('Error handling message', error as Error, {
        exchange: message.fields.exchange,
        routingKey: message.fields.routingKey,
        deliveryTag: message.fields.deliveryTag,
        queue: queueName
      });

      // Handle deserialization or other processing errors
      this.handleFailedMessage(message, queueName, channel).catch(dlqError => {
        this.logger.logError('Error routing failed message to DLQ', dlqError as Error, {
          deliveryTag: message.fields.deliveryTag,
          queue: queueName
        });
        // Fallback to regular nack without requeue to avoid infinite loop
        try {
          channel.nack(message, false, false);
        } catch (nackError) {
          this.logger.logError('Error negative acknowledging failed message', nackError as Error, {
            deliveryTag: message.fields.deliveryTag,
            queue: queueName
          });
        }
      });
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
      throw new SubscriptionError('Exchange parameter is required and must be a non-empty string', {
        exchange,
        queue,
        routingKey
      });
    }

    if (!queue || typeof queue !== 'string') {
      throw new SubscriptionError('Queue parameter is required and must be a non-empty string', {
        exchange,
        queue,
        routingKey
      });
    }

    if (!routingKey || typeof routingKey !== 'string') {
      throw new SubscriptionError('RoutingKey parameter is required and must be a non-empty string', {
        exchange,
        queue,
        routingKey
      });
    }

    if (!callback || typeof callback !== 'function') {
      throw new SubscriptionError('Callback parameter is required and must be a function', {
        exchange,
        queue,
        routingKey,
        callbackType: typeof callback
      });
    }
  }

  /**
   * Deserialize message content from JSON
   * @param message RabbitMQ message
   * @returns Deserialized payload
   */
  private deserializeMessage(message: amqp.ConsumeMessage): any {
    try {
      const contentString = message.content.toString('utf8');
      return JSON.parse(contentString);
    } catch (error) {
      throw new SubscriptionError('Failed to deserialize message content from JSON', {
        contentType: message.properties.contentType,
        contentLength: message.content.length,
        error: error instanceof Error ? error.message : 'Unknown deserialization error'
      });
    }
  }

  /**
   * Ensure exchange, queue, and binding exist before subscribing
   * @param exchange Exchange name
   * @param queue Queue name
   * @param routingKey Routing key for binding
   */
  private async ensureResourcesExist(
    exchange: string,
    queue: string,
    routingKey: string
  ): Promise<void> {
    try {
      // Create exchange if it doesn't exist
      await this.resourceCreator.ensureExchange(exchange, 'direct');
      
      // Create queue if it doesn't exist
      await this.resourceCreator.ensureQueue(queue);
      
      // Bind queue to exchange with routing key
      await this.resourceCreator.bindQueue(queue, exchange, routingKey);
      
    } catch (error) {
      throw new SubscriptionError('Failed to ensure resources exist for subscription', {
        exchange,
        queue,
        routingKey,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Log subscription errors with detailed context
   * @param error The error that occurred
   * @param exchange Exchange name
   * @param queue Queue name
   * @param routingKey Routing key
   */
  private logSubscriptionError(
    error: unknown,
    exchange: string,
    queue: string,
    routingKey: string
  ): void {
    this.logger.logError('Message subscription failed', error as Error, {
      exchange,
      queue,
      routingKey,
      operation: 'subscribe'
    });
  }

  /**
   * Get active consumer information for monitoring
   */
  public getActiveConsumers(): string[] {
    return Array.from(this.activeConsumers.keys());
  }

  /**
   * Handle failed message by routing to DLQ or acknowledging based on configuration
   * @param message Failed RabbitMQ message
   * @param queueName Original queue name
   * @param channel Channel for acknowledgment
   */
  private async handleFailedMessage(
    message: amqp.ConsumeMessage,
    queueName: string,
    channel: amqp.Channel
  ): Promise<void> {
    try {
      if (this.dlqHandler.isEnabled()) {
        // Check retry count to determine if message should go to DLQ
        const retryCount = this.getRetryCount(message);
        const maxRetries = this.dlqHandler.getDLQConfig().maxRetries || 3;

        if (retryCount >= maxRetries) {
          // Route to DLQ after max retries exceeded
          await this.dlqHandler.handleFailedMessage(message, queueName);
          
          // Acknowledge the message since it's been routed to DLQ
          channel.ack(message);
          
          this.logger.info(`Message routed to DLQ after retries`, {
            retryCount,
            queue: queueName,
            deliveryTag: message.fields.deliveryTag
          });
        } else {
          // Increment retry count and requeue for retry
          await this.requeueWithRetryCount(message, channel, retryCount + 1);
          
          this.logger.info(`Message requeued for retry`, {
            retryAttempt: retryCount + 1,
            maxRetries,
            queue: queueName,
            deliveryTag: message.fields.deliveryTag
          });
        }
      } else {
        // DLQ is disabled, acknowledge failed messages without reprocessing
        channel.ack(message);
        
        this.logger.info(`DLQ disabled. Failed message acknowledged without reprocessing`, {
          queue: queueName,
          deliveryTag: message.fields.deliveryTag
        });
      }
    } catch (error) {
      this.logger.logError(`Failed to handle failed message`, error as Error, {
        queue: queueName,
        deliveryTag: message.fields.deliveryTag
      });
      throw error;
    }
  }

  /**
   * Get retry count from message headers
   * @param message RabbitMQ message
   * @returns Current retry count
   */
  private getRetryCount(message: amqp.ConsumeMessage): number {
    if (!message.properties.headers) {
      return 0;
    }
    
    return message.properties.headers['x-retry-count'] || 0;
  }

  /**
   * Requeue message with incremented retry count
   * @param message Original message
   * @param channel Channel for operations
   * @param retryCount New retry count
   */
  private async requeueWithRetryCount(
    message: amqp.ConsumeMessage,
    channel: amqp.Channel,
    retryCount: number
  ): Promise<void> {
    try {
      // Add retry delay if configured
      const retryDelay = this.dlqHandler.getDLQConfig().retryDelay || 0;
      
      if (retryDelay > 0) {
        // Use setTimeout for delay before requeuing
        setTimeout(() => {
          this.republishWithRetryCount(message, channel, retryCount).catch(error => {
            this.logger.logError('Error republishing message with retry count', error as Error, {
              retryCount,
              deliveryTag: message.fields.deliveryTag
            });
            // Fallback to regular nack
            try {
              channel.nack(message, false, true);
            } catch (nackError) {
              this.logger.logError('Error negative acknowledging message', nackError as Error, {
                deliveryTag: message.fields.deliveryTag
              });
            }
          });
        }, retryDelay);
        
        // Acknowledge original message since we're republishing
        channel.ack(message);
      } else {
        // No delay, just nack with requeue
        channel.nack(message, false, true);
      }
    } catch (error) {
      this.logger.logError('Error requeuing message with retry count', error as Error, {
        retryCount,
        deliveryTag: message.fields.deliveryTag
      });
      // Fallback to regular nack
      channel.nack(message, false, true);
    }
  }

  /**
   * Republish message with updated retry count
   * @param message Original message
   * @param channel Channel for operations
   * @param retryCount New retry count
   */
  private async republishWithRetryCount(
    message: amqp.ConsumeMessage,
    channel: amqp.Channel,
    retryCount: number
  ): Promise<void> {
    try {
      // Update headers with retry count
      const updatedHeaders = {
        ...message.properties.headers,
        'x-retry-count': retryCount,
        'x-retry-timestamp': Date.now()
      };

      const publishOptions = {
        ...message.properties,
        headers: updatedHeaders
      };

      // Republish to the same exchange and routing key
      const published = channel.publish(
        message.fields.exchange,
        message.fields.routingKey,
        message.content,
        publishOptions
      );

      if (!published) {
        throw new Error('Failed to republish message - channel buffer full');
      }
    } catch (error) {
      const errorMessage = `Failed to republish message with retry count: ${error instanceof Error ? error.message : 'Unknown error'}`;
      throw new Error(errorMessage);
    }
  }

  /**
   * Extract queue name from message (fallback to routing key if not available)
   * @param message RabbitMQ message
   * @returns Queue name
   */
  private getQueueNameFromMessage(message: amqp.ConsumeMessage): string {
    // Try to get queue name from headers first
    if (message.properties.headers && message.properties.headers['x-original-queue']) {
      return message.properties.headers['x-original-queue'];
    }
    
    // Fallback to routing key (common pattern)
    return message.fields.routingKey || 'unknown-queue';
  }

  /**
   * Cleanup all active consumers (useful for shutdown)
   */
  public async cleanup(): Promise<void> {
    const queues = Array.from(this.activeConsumers.keys());
    
    for (const queue of queues) {
      try {
        await this.unsubscribe(queue);
      } catch (error) {
        this.logger.logError(`Error cleaning up consumer for queue`, error as Error, { queue });
      }
    }
    
    this.logger.info('MessageSubscriber cleanup completed', { cleanedQueues: queues.length });
  }
}