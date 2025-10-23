/**
 * Configuration interface for the SDK RabbitMQ
 */
export interface IConfiguration {
  /** RabbitMQ connection URL */
  url: string;
  
  /** Dead Letter Queue configuration */
  dlq: {
    /** Whether DLQ is active */
    active: boolean;
    /** Time to live for messages in DLQ (milliseconds) */
    ttl?: number;
    /** Maximum number of retries before sending to DLQ */
    maxRetries?: number;
    /** Delay between retries (milliseconds) */
    retryDelay?: number;
  };
  
  /** Logging configuration */
  logging?: {
    /** Log level */
    level: 'error' | 'warn' | 'info' | 'debug';
    /** Log format */
    format: 'json' | 'text';
  };
}

/**
 * Configuration manager interface
 */
export interface IConfigurationManager {
  /** Load configuration from config.json */
  loadConfig(): IConfiguration;
  
  /** Validate configuration schema */
  validateConfig(config: IConfiguration): void;
}