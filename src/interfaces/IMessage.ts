/**
 * Message callback type for handling received messages
 */
export type MessageCallback = (
  message: any,
  ack: () => void,
  nack: () => void
) => void;

/**
 * Message publisher interface
 */
export interface IMessagePublisher {
  /** Publish a message to an exchange */
  publish(exchange: string, routingKey: string, payload: any): Promise<boolean>;
}

/**
 * Message subscriber interface
 */
export interface IMessageSubscriber {
  /** Subscribe to messages from a queue */
  subscribe(
    exchange: string,
    queue: string,
    routingKey: string,
    callback: MessageCallback
  ): Promise<void>;
  
  /** Unsubscribe from a queue */
  unsubscribe(queue: string): Promise<void>;
}

/**
 * RabbitMQ message structure
 */
export interface RabbitMQMessage {
  content: Buffer;
  fields: {
    deliveryTag: number;
    redelivered: boolean;
    exchange: string;
    routingKey: string;
  };
  properties: {
    contentType: string;
    timestamp: number;
    messageId: string;
    headers: Record<string, any>;
  };
}

/**
 * Processed message structure
 */
export interface ProcessedMessage {
  payload: any;
  metadata: {
    exchange: string;
    routingKey: string;
    timestamp: number;
    deliveryTag: number;
    redelivered: boolean;
  };
}