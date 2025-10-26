/**
 * Queue options for resource creation
 */
export interface QueueOptions {
  durable?: boolean;
  exclusive?: boolean;
  autoDelete?: boolean;
  arguments?: Record<string, any>;
}

/**
 * Exchange options for resource creation
 */
export interface ExchangeOptions {
  durable?: boolean;
  autoDelete?: boolean;
  arguments?: Record<string, any>;
}

/**
 * Resource creator interface for auto-creating exchanges and queues
 */
export interface IResourceCreator {
  /** Ensure exchange exists, create if it doesn't */
  ensureExchange(exchange: string, type?: string, options?: ExchangeOptions): Promise<void>;
  
  /** Ensure queue exists, create if it doesn't */
  ensureQueue(queue: string, options?: QueueOptions): Promise<void>;
  
  /** Bind queue to exchange with routing key */
  bindQueue(queue: string, exchange: string, routingKey: string): Promise<void>;
  
  /** Unbind queue from exchange with routing key */
  unbindQueue(queue: string, exchange: string, routingKey: string): Promise<void>;
}