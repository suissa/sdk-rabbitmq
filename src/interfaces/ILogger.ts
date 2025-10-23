/**
 * Logger interface for structured logging
 */
export interface ILogger {
  /** Log error message with optional context */
  error(message: string, context?: any): void;
  
  /** Log warning message with optional context */
  warn(message: string, context?: any): void;
  
  /** Log info message with optional context */
  info(message: string, context?: any): void;
  
  /** Log debug message with optional context */
  debug(message: string, context?: any): void;
}