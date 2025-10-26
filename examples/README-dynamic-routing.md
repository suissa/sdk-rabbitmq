# Teste de Fluxo de Roteamento Dinâmico

Este teste implementa um fluxo de mensagens com roteamento dinâmico usando o SDK RabbitMQ.

## Descrição do Fluxo

O teste simula um sistema de chatbot onde diferentes agentes processam informações do usuário em sequência:

1. **GreetingAgent** - Recebe mensagens iniciais e inicia o fluxo
2. **PatientNameAgent** - Coleta o nome do paciente
3. **PatientCPFAgent** - Coleta o CPF do paciente
4. **PatientEmailAgent** - Coleta o email do paciente

## Arquitetura

### Exchanges
- `chatbot.whatsapp` (topic) - Para mensagens do WhatsApp
- `chatbot.agents` (topic) - Para comunicação entre agentes
- `whatsapp.message.text` (topic) - Para monitoramento de mensagens finais

### Fluxo de Roteamento Dinâmico

1. **GreetingAgent** escuta `chatbot.whatsapp` com routing key `phone.*`
2. Cada agente subsequente:
   - Escuta `chatbot.agents` com sua routing key específica
   - Faz bind dinâmico para `phone.{telefone}` em `chatbot.whatsapp`
   - Processa a mensagem
   - Faz unbind da routing key específica
   - Envia para o próximo agente

### Memória Global

```typescript
interface GlobalMemory {
  flow: string[];                                    // Sequência dos agentes
  currentStep: Record<string, Record<string, string>>; // Status por telefone
  userData: Record<string, Record<string, any>>;      // Dados coletados
}
```

## Como Executar

### Pré-requisitos
- RabbitMQ rodando localmente (porta 5672)
- Node.js e npm instalados
- Dependências do projeto instaladas

### Opções de Execução

#### 1. TypeScript (Recomendado)
```bash
npm run test:dynamic-routing
```

#### 2. JavaScript
```bash
npm run test:dynamic-routing:js
```

#### 3. Execução Manual
```bash
# Compilar primeiro
npm run build

# Executar TypeScript
npx ts-node examples/test-dynamic-routing-flow.ts

# Ou executar JavaScript compilado
node examples/test-dynamic-routing-flow.js
```

## Estrutura dos Agentes

### BaseAgent (Classe Abstrata)
```typescript
abstract class BaseAgent {
  protected config: AgentConfig;
  protected sdk: SdkRabbitmq;
  protected name: string;
  protected routingKeyAgent: string;

  protected async processMessage(payload: MessagePayload, ack: () => void, nack: () => void): Promise<void>
  abstract start(): Promise<void>;
}
```

### GreetingAgentImpl
- Escuta `phone.*` em `chatbot.whatsapp`
- Inicia o fluxo para novos telefones

### DynamicAgent
- Escuta sua routing key específica em `chatbot.agents`
- Faz bind/unbind dinâmico para telefones específicos

## Payload das Mensagens

```typescript
interface MessagePayload {
  phone: string;
  timestamp: number;
  metadata: {
    identification: string;
    senderAgent: string;
    value: string;
    userData?: Record<string, any>;
  };
}
```

## Monitoramento

O teste inclui um subscriber de monitoramento que escuta `whatsapp.message.text` com routing key `send` para capturar as mensagens finais do fluxo.

## Logs Esperados

Durante a execução, você verá logs detalhados mostrando:
- ✅ Inicialização dos agentes
- 🔒 Bind/unbind dinâmico de routing keys
- 🤖 Processamento de mensagens por cada agente
- 📊 Estado da memória global
- 📱 Mensagens finais no monitor

## Exemplo de Saída

```
🎯 Iniciando teste de fluxo de roteamento dinâmico...

✅ SDK inicializado com sucesso

👂 Configurando subscriber de monitoramento...

🤖 Inicializando agentes...
🚀 Iniciando GreetingAgent...
👂 GreetingAgent ouvindo na exchange: chatbot.whatsapp, routing key: phone.*

🚀 Iniciando PatientNameAgent...
👂 PatientNameAgent ouvindo na exchange: chatbot.agents, routing key: patientName

...

🔥 Iniciando fluxo para telefone: 5511999999999

🤖 GreetingAgent processando mensagem: {...}
✅ Step greeting marked as success for phone 5511999999999
📤 GreetingAgent enviando para próximo agente: patientName

🔒 PatientNameAgent fez bind para routing key: phone.5511999999999
🤖 PatientNameAgent processando mensagem: {...}
🔓 PatientNameAgent fez unbind da routing key: phone.5511999999999
...
```

## Configuração

O teste usa a configuração padrão do SDK. Para personalizar, edite o arquivo `config.json` na raiz do projeto ou configure as variáveis de ambiente apropriadas.