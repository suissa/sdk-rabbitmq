# SDK RabbitMQ

A simplified and standardized SDK for RabbitMQ interactions with singleton pattern, auto-reconnection, and Dead Letter Queue (DLQ) support.

## Features

- **Singleton Pattern**: Ensures single connection per application
- **Auto-Reconnection**: Automatic reconnection with exponential backoff
- **Resource Auto-Creation**: Automatically creates exchanges and queues
- **Dead Letter Queue Support**: Comprehensive DLQ handling
- **Structured Logging**: Configurable logging system
- **TypeScript Support**: Full TypeScript definitions

## Project Structure

```
src/
├── interfaces/          # TypeScript interfaces and types
│   ├── IConfiguration.ts    # Configuration interfaces
│   ├── IConnection.ts       # Connection management interfaces
│   ├── IMessage.ts          # Message handling interfaces
│   ├── IResource.ts         # Resource creation interfaces
│   ├── IDLQ.ts             # Dead Letter Queue interfaces
│   ├── ILogger.ts          # Logging interfaces
│   ├── ISdkRabbitmq.ts     # Main SDK interface
│   ├── IErrors.ts          # Error classes
│   └── index.ts            # Interface exports
├── components/          # Implementation components
│   ├── ConfigurationManager.ts  # Configuration management
│   ├── ConnectionManager.ts     # Connection handling with auto-reconnect
│   ├── MessagePublisher.ts      # Message publishing
│   ├── MessageSubscriber.ts     # Message consumption
│   ├── ResourceCreator.ts       # Auto-creation of exchanges/queues
│   ├── DLQHandler.ts           # Dead Letter Queue handling
│   ├── Logger.ts               # Structured logging
│   ├── SdkRabbitmq.ts          # Main SDK singleton class
│   └── index.ts                # Component exports
├── utils/              # Utility functions
│   └── configSchema.ts         # Configuration validation
└── index.ts            # Main SDK export
```

## Development

### Prerequisites

- Node.js >= 16
- npm or yarn
- RabbitMQ server (for testing)

### Installation

```bash
npm install
```

### Build

```bash
npm run build
```

### Testing

```bash
npm test
```

### Linting

```bash
npm run lint
npm run lint:fix
```

## Configuration

The SDK expects a `config.json` file in the project root:

```json
{
  "url": "amqp://localhost:5672",
  "dlq": {
    "active": true,
    "ttl": 300000,
    "maxRetries": 3,
    "retryDelay": 5000
  },
  "logging": {
    "level": "info",
    "format": "json"
  }
}
```

## Usage

### Basic Usage

```typescript
import { SdkRabbitmq } from 'sdk-rabbitmq';

async function main() {
  // Get SDK singleton instance (automatically initializes all components)
  const sdk = await SdkRabbitmq.getInstance();

  // Publish message
  const success = await sdk.publish('user-events', 'user.created', {
    userId: '12345',
    email: 'user@example.com',
    timestamp: new Date().toISOString()
  });

  console.log('Message published:', success);

  // Subscribe to messages
  await sdk.subscribe('user-events', 'user-notifications', 'user.created', 
    (message, ack, nack) => {
      try {
        console.log('Received:', message);
        // Process message
        ack(); // Acknowledge successful processing
      } catch (error) {
        console.error('Processing failed:', error);
        nack(); // Send to DLQ if enabled
      }
    }
  );

  // Graceful shutdown
  await sdk.disconnect();
}
```

### Advanced Usage

```typescript
import { SdkRabbitmq } from 'sdk-rabbitmq';

async function advancedExample() {
  const sdk = await SdkRabbitmq.getInstance();

  // Check if SDK is ready
  if (sdk.isReady()) {
    console.log('SDK is connected and ready');
  }

  // Get active consumers for monitoring
  const consumers = sdk.getActiveConsumers();
  console.log('Active consumers:', consumers);

  // Multiple subscriptions
  await Promise.all([
    sdk.subscribe('orders', 'order-processing', 'order.created', handleOrderCreated),
    sdk.subscribe('orders', 'order-notifications', 'order.updated', handleOrderUpdated),
    sdk.subscribe('users', 'user-analytics', 'user.*', handleUserEvents)
  ]);

  // Bulk publishing
  const messages = [
    { exchange: 'orders', routingKey: 'order.created', payload: { orderId: 1 } },
    { exchange: 'orders', routingKey: 'order.created', payload: { orderId: 2 } },
    { exchange: 'users', routingKey: 'user.registered', payload: { userId: 'abc' } }
  ];

  for (const msg of messages) {
    await sdk.publish(msg.exchange, msg.routingKey, msg.payload);
  }
}

function handleOrderCreated(message: any, ack: () => void, nack: () => void) {
  // Process order creation
  ack();
}

function handleOrderUpdated(message: any, ack: () => void, nack: () => void) {
  // Process order update
  ack();
}

function handleUserEvents(message: any, ack: () => void, nack: () => void) {
  // Process user events
  ack();
}
```

### Error Handling

```typescript
import { SdkRabbitmq } from 'sdk-rabbitmq';

async function errorHandlingExample() {
  try {
    const sdk = await SdkRabbitmq.getInstance();

    // Publishing with error handling
    const success = await sdk.publish('exchange', 'key', { data: 'test' });
    if (!success) {
      console.error('Failed to publish message');
    }

    // Subscription with error handling
    await sdk.subscribe('exchange', 'queue', 'key', (message, ack, nack) => {
      try {
        // Risky operation that might fail
        processMessage(message);
        ack();
      } catch (error) {
        console.error('Message processing failed:', error);
        // Message will be sent to DLQ if configured
        nack();
      }
    });

  } catch (error) {
    console.error('SDK initialization failed:', error);
  }
}

function processMessage(message: any) {
  // Simulate processing that might fail
  if (Math.random() > 0.8) {
    throw new Error('Random processing failure');
  }
  console.log('Message processed successfully:', message);
}
```

## License

MIT