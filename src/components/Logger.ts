import { ILogger } from '../interfaces/ILogger';
import { IConfiguration } from '../interfaces/IConfiguration';

/**
 * Log levels with numeric values for comparison
 */
export enum LogLevel {
  ERROR = 0,
  WARN = 1,
  INFO = 2,
  DEBUG = 3
}

/**
 * Log entry structure for JSON formatting
 */
interface LogEntry {
  timestamp: string;
  level: string;
  message: string;
  context?: any;
  component?: string;
  operation?: string;
}

/**
 * Logger class that provides structured logging with configurable levels and formats
 */
export class Logger implements ILogger {
  private static instance: Logger | null = null;
  private logLevel: LogLevel;
  private format: 'json' | 'text';
  private component?: string;

  /**
   * Private constructor to enforce singleton pattern
   */
  private constructor(config?: IConfiguration['logging'], component?: string) {
    this.logLevel = this.parseLogLevel(config?.level || 'info');
    this.format = config?.format || 'text';
    if (component) {
      this.component = component;
    }
  }

  /**
   * Get singleton instance of Logger
   */
  public static getInstance(config?: IConfiguration['logging'], component?: string): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger(config, component);
    }
    return Logger.instance;
  }

  /**
   * Create a new logger instance for a specific component
   */
  public static createComponentLogger(component: string, config?: IConfiguration['logging']): Logger {
    return new Logger(config, component);
  }

  /**
   * Log error message with optional context
   */
  public error(message: string, context?: any): void {
    this.log(LogLevel.ERROR, 'ERROR', message, context);
  }

  /**
   * Log warning message with optional context
   */
  public warn(message: string, context?: any): void {
    this.log(LogLevel.WARN, 'WARN', message, context);
  }

  /**
   * Log info message with optional context
   */
  public info(message: string, context?: any): void {
    this.log(LogLevel.INFO, 'INFO', message, context);
  }

  /**
   * Log debug message with optional context
   */
  public debug(message: string, context?: any): void {
    this.log(LogLevel.DEBUG, 'DEBUG', message, context);
  }

  /**
   * Log operation with context (for operation tracking)
   */
  public logOperation(operation: string, message: string, context?: any): void {
    const operationContext = {
      operation,
      ...context
    };
    this.info(message, operationContext);
  }

  /**
   * Log error with stack trace
   */
  public logError(message: string, error: Error, context?: any): void {
    const errorContext = {
      error: {
        name: error.name,
        message: error.message,
        stack: error.stack
      },
      ...context
    };
    this.error(message, errorContext);
  }

  /**
   * Log connection state changes
   */
  public logConnectionState(state: string, context?: any): void {
    const connectionContext = {
      connectionState: state,
      ...context
    };
    this.info(`Connection state changed to: ${state}`, connectionContext);
  }

  /**
   * Internal logging method
   */
  private log(level: LogLevel, levelName: string, message: string, context?: any): void {
    // Check if this log level should be output
    if (level > this.logLevel) {
      return;
    }

    const timestamp = new Date().toISOString();
    
    if (this.format === 'json') {
      const logEntry: LogEntry = {
        timestamp,
        level: levelName,
        message
      };
      
      if (context) {
        logEntry.context = context;
      }
      
      if (this.component) {
        logEntry.component = this.component;
      }
      
      console.log(JSON.stringify(logEntry));
    } else {
      // Text format
      const componentPrefix = this.component ? `[${this.component}] ` : '';
      const contextSuffix = context ? ` | Context: ${JSON.stringify(context)}` : '';
      
      const logMessage = `${timestamp} [${levelName}] ${componentPrefix}${message}${contextSuffix}`;
      
      // Use appropriate console method based on level
      switch (level) {
        case LogLevel.ERROR:
          console.error(logMessage);
          break;
        case LogLevel.WARN:
          console.warn(logMessage);
          break;
        case LogLevel.DEBUG:
          console.debug(logMessage);
          break;
        default:
          console.log(logMessage);
      }
    }
  }

  /**
   * Parse log level string to enum value
   */
  private parseLogLevel(level: string): LogLevel {
    switch (level.toLowerCase()) {
      case 'error':
        return LogLevel.ERROR;
      case 'warn':
        return LogLevel.WARN;
      case 'info':
        return LogLevel.INFO;
      case 'debug':
        return LogLevel.DEBUG;
      default:
        return LogLevel.INFO;
    }
  }

  /**
   * Update logger configuration
   */
  public updateConfig(config: IConfiguration['logging']): void {
    this.logLevel = this.parseLogLevel(config?.level || 'info');
    this.format = config?.format || 'text';
  }

  /**
   * Reset singleton instance (for testing purposes)
   */
  public static resetInstance(): void {
    Logger.instance = null;
  }
}