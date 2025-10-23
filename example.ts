import { SdkRabbitmq } from './src';

/**
 * Example usage of the SdkRabbitmq singleton
 * This demonstrates the complete integration of all components
 */
async function example() {
  try {
    // Get singleton instance - this will initialize all components
    const sdk = await SdkRabbitmq.getInstance();
    
    console.log('SDK initialized successfully');
    console.log('SDK ready:', sdk.isReady());

    // Example: Subscribe to messages
    await sdk.subscribe(
      'user-events',
      'user-notifications',
      'user.created',
      (message, ack, nack) => {
        try {
          console.log('Received message:', message);
          // Process message successfully
          ack();
        } catch (error) {
          console.error('Error processing message:', error);
          // Send to DLQ if processing fails
          nack();
        }
      }
    );

    // Example: Publish a message
    const publishResult = await sdk.publish(
      'user-events',
      'user.created',
      {
        userId: '12345',
        email: 'user@example.com',
        timestamp: new Date().toISOString()
      }
    );

    console.log('Message published:', publishResult);

    // Check active consumers
    console.log('Active consumers:', sdk.getActiveConsumers());

    // Graceful shutdown after 5 seconds
    setTimeout(async () => {
      await sdk.disconnect();
      console.log('SDK disconnected');
    }, 5000);

  } catch (error) {
    console.error('Error in example:', error);
  }
}

// Run example if this file is executed directly
if (require.main === module) {
  example().catch(console.error);
}

export { example };