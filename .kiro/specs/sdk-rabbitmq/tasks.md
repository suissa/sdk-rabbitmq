# Implementation Plan - SDK RabbitMQ

- [x] 1. Set up project structure and core interfaces

  - Create package.json with TypeScript, amqplib, and testing dependencies
  - Set up TypeScript configuration with strict mode
  - Create directory structure: src/, src/interfaces/, src/components/, src/utils/
  - Define core TypeScript interfaces for all components
  - _Requirements: 1.1, 1.3_

- [x] 2. Implement Configuration Manager

  - [x] 2.1 Create configuration interface and schema validation

    - Write IConfiguration interface with url and dlq properties
    - Implement JSON schema validation for config structure
    - Create ConfigurationError class for validation failures
    - _Requirements: 1.1, 1.2, 1.4_

  - [x] 2.2 Implement config.json file reader

    - Write ConfigurationManager class to read config.json from project root
    - Add file existence validation with clear error messages
    - Implement configuration caching for performance
    - _Requirements: 1.1, 1.2_

  - [x] 2.3 Write unit tests for configuration validation

    - Test valid configuration loading
    - Test missing file error handling
    - Test invalid schema validation
    - _Requirements: 1.1, 1.2, 1.4_

- [x] 3. Implement Connection Manager with singleton pattern

  - [x] 3.1 Create connection management core

    - Write ConnectionManager class with singleton connection handling
    - Implement connection establishment using amqplib
    - Add connection state tracking (connected, disconnected, reconnecting)
    - _Requirements: 2.1, 2.2, 2.4_

  - [x] 3.2 Implement auto-reconnection with exponential backoff

    - Add connection loss detection and event handling
    - Implement retry logic with exponential backoff (1s, 2s, 4s, max 30s)
    - Create operation queuing during reconnection attempts
    - _Requirements: 5.1, 5.2, 5.3_

  - [x] 3.3 Write unit tests for connection management

    - Test singleton behavior across multiple instances
    - Test reconnection logic with mocked connection failures
    - Test operation queuing during reconnection
    - _Requirements: 2.1, 2.4, 5.1, 5.3_

- [x] 4. Implement Resource Creator for auto-creation

  - [x] 4.1 Create exchange and queue auto-creation logic

    - Write ResourceCreator class with exchange creation methods
    - Implement queue creation with default options
    - Add binding creation between exchanges and queues
    - _Requirements: 3.4, 4.3_

  - [x] 4.2 Add resource existence checking and caching

    - Implement resource existence validation before creation
    - Add in-memory cache to avoid duplicate creation attempts
    - Create error handling for resource creation failures
    - _Requirements: 3.4, 4.3_

  - [x] 4.3 Write unit tests for resource creation

    - Test exchange creation with different types
    - Test queue creation with various options
    - Test binding creation and validation
    - _Requirements: 3.4, 4.3_

- [x] 5. Implement Message Publisher

  - [x] 5.1 Create message publishing core functionality

    - Write MessagePublisher class with publish method
    - Implement parameter validation (exchange, routingKey, payload required)
    - Add JSON serialization for all payloads
    - _Requirements: 3.1, 3.2, 3.3_

  - [x] 5.2 Integrate with ResourceCreator and error handling

    - Add automatic exchange creation before publishing
    - Implement publish error handling with detailed logging
    - Create return value handling (true for success, false for failure)
    - _Requirements: 3.4, 3.5_

  - [x] 5.3 Write unit tests for message publishing

    - Test successful message publishing with JSON serialization
    - Test parameter validation error cases
    - Test automatic exchange creation integration
    - _Requirements: 3.1, 3.2, 3.3, 3.4_

- [x] 6. Implement Message Subscriber

  - [x] 6.1 Create message subscription core functionality

    - Write MessageSubscriber class with subscribe method
    - Implement parameter validation (exchange, queue, routingKey, callback required)
    - Add JSON deserialization for incoming messages
    - Create callback invocation with ack/nack functions
    - _Requirements: 4.1, 4.2, 4.4_

  - [x] 6.2 Integrate with ResourceCreator and queue management

    - Add automatic exchange and queue creation before subscribing
    - Implement queue binding with routing key
    - Create consumer management and cleanup methods
    - _Requirements: 4.3_

  - [x] 6.3 Write unit tests for message subscription

    - Test successful message consumption with JSON deserialization
    - Test parameter validation error cases
    - Test automatic resource creation integration
    - _Requirements: 4.1, 4.2, 4.3, 4.4_

- [x] 7. Implement DLQ Handler

  - [x] 7.1 Create DLQ setup and configuration

    - Write DLQHandler class with DLQ exchange and queue creation
    - Implement DLQ configuration reading from config.json
    - Add DLQ naming conventions (original-queue.dlq, original-exchange.dlq)
    - _Requirements: 6.1, 6.3_

  - [x] 7.2 Implement failed message routing to DLQ

    - Add message failure detection in subscriber callback
    - Implement message routing to DLQ with original metadata
    - Create TTL and retry count handling based on configuration
    - Add conditional DLQ processing based on active flag
    - _Requirements: 4.5, 6.2, 6.4_

  - [x] 7.3 Write unit tests for DLQ functionality

    - Test DLQ setup with various configurations
    - Test failed message routing to DLQ
    - Test DLQ disabled behavior (direct acknowledgment)
    - _Requirements: 6.1, 6.2, 6.4_

- [x] 8. Implement Logger component

  - [x] 8.1 Create structured logging system

    - Write Logger class with configurable log levels (error, warn, info, debug)
    - Implement JSON and text formatting options
    - Add contextual logging with operation metadata
    - _Requirements: 7.1, 7.4_

  - [x] 8.2 Integrate logging across all components

    - Replace console.log/error calls with Logger throughout codebase
    - Add connection state change logging in ConnectionManager
    - Implement operation logging (publish, subscribe, reconnect) in all components
    - Create error logging with stack traces and context
    - _Requirements: 7.2, 7.3_

  - [x] 8.3 Write unit tests for logging functionality

    - Test different log levels and formatting
    - Test contextual logging with metadata
    - Test log integration across components
    - _Requirements: 7.1, 7.2, 7.4_

- [x] 9. Implement main SdkRabbitmq singleton class

  - [x] 9.1 Create singleton pattern implementation

    - Write SdkRabbitmq class with static instance management
    - Implement constructor that returns existing instance if available
    - Add initialization logic that connects all components
    - _Requirements: 2.1, 2.3_

  - [x] 9.2 Implement public API methods (publish/subscribe)

    - Create publish method that delegates to MessagePublisher
    - Create subscribe method that delegates to MessageSubscriber
    - Add disconnect method for graceful shutdown
    - Implement parameter validation at API level
    - _Requirements: 3.1, 4.1_

  - [x] 9.3 Wire all components together

    - Integrate ConfigurationManager for config loading
    - Connect ConnectionManager for connection handling
    - Wire ResourceCreator, DLQHandler, and Logger
    - Add component lifecycle management
    - Export SdkRabbitmq from main index.ts
    - _Requirements: 2.2, 2.3_

  - [x] 9.4 Write integration tests for complete SDK

    - Test singleton behavior across multiple instantiations
    - Test end-to-end publish and subscribe workflows
    - Test error scenarios and recovery
    - _Requirements: 2.1, 3.1, 4.1_

- [x] 10. Create example configuration and usage documentation

  - [x] 10.1 Create example config.json file

    - Write sample configuration with all available options
    - Add comments explaining each configuration parameter
    - Include both minimal and comprehensive configuration examples
    - _Requirements: 1.1, 1.5_

  - [x] 10.2 Update README with usage examples

    - Write basic usage examples for publish and subscribe
    - Create advanced examples with DLQ configuration
    - Add error handling examples and best practices
    - Document singleton behavior and connection management
    - Update project structure documentation
    - _Requirements: 2.1, 3.1, 4.1_

- [x] 11. Fix failing tests and finalize implementation


  - [x] 11.1 Fix ConnectionManager test failures

    - Fix exponential backoff test timing issues in reconnection logic
    - Fix operation queuing tests that are timing out
    - Ensure proper mock cleanup and test isolation
    - _Requirements: 5.1, 5.2, 5.3_

  - [x] 11.2 Run linting and fix any remaining issues

    - Run ESLint to identify and fix any linting warnings
    - Remove any unused imports or variables
    - Ensure consistent code formatting
    - _Requirements: All_

  - [x] 11.3 Validate complete implementation against requirements

    - Verify all requirements are fully implemented and tested
    - Run full test suite to ensure all tests pass
    - Validate that the SDK works as expected with the example configuration
    - _Requirements: All_
