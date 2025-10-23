/**
 * Dead Letter Queue handler interface
 */
export interface IDLQHandler {
  /** Set up DLQ for a given original queue */
  setupDLQ(originalQueue: string): Promise<string>;
  
  /** Handle a failed message by routing to DLQ */
  handleFailedMessage(message: any, originalQueue: string): Promise<void>;
  
  /** Check if DLQ is enabled in configuration */
  isEnabled(): boolean;
}