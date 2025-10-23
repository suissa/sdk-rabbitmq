# Requirements Document

## Introduction

O SDK RabbitMQ é uma biblioteca que fornece uma interface padronizada e simplificada para interação com RabbitMQ, implementando padrão singleton para garantir conexão única, reconexão automática, e abstraindo complexidades de canais, filas e DLQ (Dead Letter Queue).

## Glossary

- **SDK_RabbitMQ**: O sistema principal que gerencia conexões e operações com RabbitMQ
- **Connection_Manager**: Componente responsável por gerenciar a conexão singleton com RabbitMQ
- **Message_Publisher**: Componente responsável por publicar mensagens
- **Message_Subscriber**: Componente responsável por consumir mensagens
- **DLQ_Handler**: Componente que gerencia Dead Letter Queues
- **Auto_Reconnection**: Funcionalidade que reconecta automaticamente quando a conexão é perdida
- **Resource_Creator**: Componente que cria exchanges e filas automaticamente se não existirem

## Requirements

### Requirement 1

**User Story:** Como desenvolvedor, eu quero definir configurações em um arquivo config.json na raiz do projeto, para que eu possa centralizar e versionar as configurações do RabbitMQ.

#### Acceptance Criteria

1. THE SDK_RabbitMQ SHALL read configuration from config.json file located at project root
2. WHEN config.json file does not exist, THE SDK_RabbitMQ SHALL throw configuration error with clear message
3. THE SDK_RabbitMQ SHALL validate required configuration properties (url, dlq settings)
4. WHEN configuration is invalid, THE SDK_RabbitMQ SHALL throw validation error with specific missing properties
5. THE SDK_RabbitMQ SHALL support configuration schema with url and dlq object containing active boolean and additional DLQ settings

### Requirement 2

**User Story:** Como desenvolvedor, eu quero instanciar o SDK com configurações e obter sempre a mesma instância conectada, para que eu possa usar o padrão singleton e evitar múltiplas conexões.

#### Acceptance Criteria

1. WHEN a developer creates a new SdkRabbitmq instance, THE SDK_RabbitMQ SHALL return the same connected instance if one already exists
2. WHEN the first SdkRabbitmq instance is created, THE SDK_RabbitMQ SHALL establish connection to RabbitMQ using configuration from config.json
3. WHEN connection is established, THE SDK_RabbitMQ SHALL return a ready-to-use instance
4. THE Connection_Manager SHALL maintain singleton pattern across multiple instantiation attempts

### Requirement 3

**User Story:** Como desenvolvedor, eu quero publicar mensagens usando uma função simples publish(exchange, routingKey, payload), para que eu possa enviar eventos de forma padronizada.

#### Acceptance Criteria

1. THE Message_Publisher SHALL provide a publish method that accepts exchange, routingKey, and payload parameters
2. WHEN publish method is called, THE Message_Publisher SHALL validate that all required parameters are provided
3. WHEN publishing a message, THE Message_Publisher SHALL convert payload to JSON format
4. WHEN exchange does not exist, THE Resource_Creator SHALL create the exchange automatically
5. WHEN publish operation fails, THE SDK_RabbitMQ SHALL log the failure details

### Requirement 4

**User Story:** Como desenvolvedor, eu quero consumir mensagens usando uma função subscribe(exchange, queue, routingKey, callback), para que eu possa processar eventos de forma padronizada.

#### Acceptance Criteria

1. THE Message_Subscriber SHALL provide a subscribe method that accepts exchange, queue, routingKey, and callback parameters
2. WHEN subscribe method is called, THE Message_Subscriber SHALL validate that all required parameters are provided
3. WHEN queue or exchange does not exist, THE Resource_Creator SHALL create them automatically
4. WHEN message is received, THE Message_Subscriber SHALL parse JSON payload and invoke callback
5. WHEN message processing fails, THE DLQ_Handler SHALL handle message according to DLQ configuration

### Requirement 5

**User Story:** Como desenvolvedor, eu quero que o SDK mantenha conexão resiliente com reconexão automática, para que minha aplicação continue funcionando mesmo com instabilidades de rede.

#### Acceptance Criteria

1. WHEN connection to RabbitMQ is lost, THE Auto_Reconnection SHALL attempt to reconnect automatically
2. WHILE reconnection is in progress, THE SDK_RabbitMQ SHALL queue operations and execute them after reconnection
3. WHEN reconnection fails, THE SDK_RabbitMQ SHALL log failure details and retry with exponential backoff
4. THE Connection_Manager SHALL maintain only one active connection per SDK instance

### Requirement 6

**User Story:** Como desenvolvedor, eu quero configurar Dead Letter Queue para reprocessamento de mensagens falhadas, para que eu possa tratar erros de processamento adequadamente.

#### Acceptance Criteria

1. WHERE DLQ is active in configuration, THE DLQ_Handler SHALL create dead letter exchanges and queues
2. WHEN message processing fails and DLQ is active, THE DLQ_Handler SHALL route failed messages to dead letter queue
3. THE DLQ_Handler SHALL apply configured DLQ settings for message routing
4. WHEN DLQ is not active, THE SDK_RabbitMQ SHALL acknowledge failed messages without reprocessing

### Requirement 7

**User Story:** Como desenvolvedor, eu quero logs detalhados de operações e falhas, para que eu possa monitorar e debugar o comportamento do SDK.

#### Acceptance Criteria

1. WHEN any operation is performed, THE SDK_RabbitMQ SHALL log operation details with configurable log level
2. WHEN failures occur, THE SDK_RabbitMQ SHALL log error details including context and stack trace
3. WHEN connection state changes, THE SDK_RabbitMQ SHALL log connection status updates
4. THE SDK_RabbitMQ SHALL provide consistent log message formatting across all components