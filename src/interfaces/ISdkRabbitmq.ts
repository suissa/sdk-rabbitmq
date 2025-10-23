import { MessageCallback } from './IMessage';

/**
 * Main SDK RabbitMQ interface - the public API
 */
export interface ISdkRabbitmq {
  /** Publish a message to an exchange */
  publish(exchange: string, routingKey: string, payload: any): Promise<boolean>;
  
  /** Subscribe to messages from a queue */
  subscribe(
    exchange: string,
    queue: string,
    routingKey: string,
    callback: MessageCallback
  ): Promise<void>;
  
  /** Disconnect from RabbitMQ gracefully */
  disconnect(): Promise<void>;
}