/**
 * Base SDK RabbitMQ error class
 */
export class SdkRabbitmqError extends Error {
  constructor(
    message: string,
    public code: string,
    public context?: any
  ) {
    super(message);
    this.name = 'SdkRabbitmqError';
  }
}

/**
 * Configuration related errors
 */
export class ConfigurationError extends SdkRabbitmqError {
  constructor(message: string, context?: any) {
    super(message, 'CONFIGURATION_ERROR', context);
    this.name = 'ConfigurationError';
  }
}

/**
 * Connection related errors
 */
export class ConnectionError extends SdkRabbitmqError {
  constructor(message: string, context?: any) {
    super(message, 'CONNECTION_ERROR', context);
    this.name = 'ConnectionError';
  }
}

/**
 * Message publishing errors
 */
export class PublishError extends SdkRabbitmqError {
  constructor(message: string, context?: any) {
    super(message, 'PUBLISH_ERROR', context);
    this.name = 'PublishError';
  }
}

/**
 * Message subscription errors
 */
export class SubscriptionError extends SdkRabbitmqError {
  constructor(message: string, context?: any) {
    super(message, 'SUBSCRIPTION_ERROR', context);
    this.name = 'SubscriptionError';
  }
}