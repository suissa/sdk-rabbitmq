import * as amqp from 'amqplib';

/**
 * Connection manager interface for managing RabbitMQ connections
 */
export interface IConnectionManager {
  /** Establish connection to RabbitMQ */
  connect(): Promise<amqp.Connection>;
  
  /** Get current connection instance */
  getConnection(): amqp.Connection | null;
  
  /** Check if currently connected */
  isConnected(): boolean;
  
  /** Disconnect from RabbitMQ */
  disconnect(): Promise<void>;
  
  /** Register callback for connection lost events */
  onConnectionLost(callback: () => void): void;
  
  /** Queue operation to be executed after reconnection */
  queueOperation(operation: () => Promise<void>): void;
  
  /** Execute operation with automatic queuing during reconnection */
  executeOperation<T>(operation: () => Promise<T>): Promise<T>;
}