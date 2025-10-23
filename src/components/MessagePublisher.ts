import * as amqp from 'amqplib';
import { IMessagePublisher } from '../interfaces/IMessage';
import { PublishError } from '../interfaces/IErrors';
import { ConnectionManager } from './ConnectionManager';
import { ResourceCreator } from './ResourceCreator';
import { Logger } from './Logger';
import { IConfiguration } from '../interfaces/IConfiguration';

/**
 * MessagePublisher handles message publishing to RabbitMQ exchanges
 * Implements parameter validation, JSON serialization, and automatic exchange creation
 */
export class MessagePublisher implements IMessagePublisher {
  private connectionManager: ConnectionManager;
  private resourceCreator: ResourceCreator;
  private logger: Logger;

  constructor(connectionManager: ConnectionManager, resourceCreator: ResourceCreator, config?: IConfiguration['logging']) {
    this.connectionManager = connectionManager;
    this.resourceCreator = resourceCreator;
    this.logger = Logger.createComponentLogger('MessagePublisher', config);
  }

  /**
   * Publish a message to an exchange
   * @param exchange Exchange name (required)
   * @param routingKey Routing key for message routing (required)
   * @param payload Message payload to be JSON serialized (required)
   * @returns Promise<boolean> - true for success, false for failure
   */
  public async publish(exchange: string, routingKey: string, payload: any): Promise<boolean> {
    // Parameter validation - all parameters are required
    this.validatePublishParameters(exchange, routingKey, payload);

    try {
      // JSON serialization for all payloads
      const serializedPayload = this.serializePayload(payload);

      // Automatic exchange creation before publishing
      await this.ensureExchangeExists(exchange);

      return await this.connectionManager.executeOperation(async () => {
        const connection = this.connectionManager.getConnection();
        if (!connection) {
          throw new PublishError('No active connection to RabbitMQ', {
            exchange,
            routingKey,
            payload: typeof payload
          });
        }

        const channel = await (connection as any).createChannel();
        
        try {
          // Publish message with JSON content type
          const published = channel.publish(
            exchange,
            routingKey,
            Buffer.from(serializedPayload),
            {
              contentType: 'application/json',
              timestamp: Date.now(),
              persistent: true // Make messages persistent by default
            }
          );

          await channel.close();
          
          // Log successful publish
          this.logger.logOperation('publish', `Message published successfully`, {
            exchange,
            routingKey,
            payloadType: typeof payload,
            payloadSize: serializedPayload.length
          });
          
          return published;
        } catch (error) {
          await channel.close();
          throw error;
        }
      });
    } catch (error) {
      // Detailed error logging with context
      this.logPublishError(error, exchange, routingKey, payload);
      
      // Return false for failure as per requirements
      return false;
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
      throw new PublishError('Exchange parameter is required and must be a non-empty string', {
        exchange,
        routingKey,
        payload: typeof payload
      });
    }

    if (!routingKey || typeof routingKey !== 'string') {
      throw new PublishError('RoutingKey parameter is required and must be a non-empty string', {
        exchange,
        routingKey,
        payload: typeof payload
      });
    }

    if (payload === undefined || payload === null) {
      throw new PublishError('Payload parameter is required and cannot be null or undefined', {
        exchange,
        routingKey,
        payload
      });
    }
  }

  /**
   * Serialize payload to JSON string
   * @param payload Payload to serialize
   * @returns JSON string representation
   */
  private serializePayload(payload: any): string {
    try {
      return JSON.stringify(payload);
    } catch (error) {
      throw new PublishError('Failed to serialize payload to JSON', {
        payload: typeof payload,
        error: error instanceof Error ? error.message : 'Unknown serialization error'
      });
    }
  }

  /**
   * Ensure exchange exists before publishing
   * @param exchange Exchange name
   */
  private async ensureExchangeExists(exchange: string): Promise<void> {
    try {
      // Use ResourceCreator to automatically create exchange if it doesn't exist
      await this.resourceCreator.ensureExchange(exchange, 'direct');
    } catch (error) {
      throw new PublishError(`Failed to ensure exchange '${exchange}' exists`, {
        exchange,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Log publish errors with detailed context
   * @param error The error that occurred
   * @param exchange Exchange name
   * @param routingKey Routing key
   * @param payload Original payload
   */
  private logPublishError(error: unknown, exchange: string, routingKey: string, payload: any): void {
    let payloadSize = 0;
    try {
      payloadSize = JSON.stringify(payload).length;
    } catch {
      payloadSize = -1; // Indicate serialization failed
    }

    this.logger.logError('Message publish failed', error as Error, {
      exchange,
      routingKey,
      payloadType: typeof payload,
      payloadSize,
      operation: 'publish'
    });
  }
}