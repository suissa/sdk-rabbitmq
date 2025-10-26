import { SdkRabbitmq } from '../src/components/SdkRabbitmq';
import { MessageCallback } from '../src/interfaces/IMessage';

// Interfaces para tipagem
interface AgentConfig {
  routingKeyAgent: string;
  name: string;
}

interface GlobalMemory {
  flow: string[];
  currentStep: Record<string, Record<string, string>>;
  userData: Record<string, Record<string, any>>;
}

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

// Memória global para controlar o fluxo
const globalMemory: GlobalMemory = {
  flow: ['greeting', 'patientName', 'patientCPF', 'patientEmail'],
  currentStep: {},
  userData: {}
};

// Definição dos agentes
const GreetingAgent: AgentConfig = {
  routingKeyAgent: 'greeting',
  name: 'GreetingAgent'
};

const PatientNameAgent: AgentConfig = {
  routingKeyAgent: 'patientName',
  name: 'PatientNameAgent'
};

const PatientCPFAgent: AgentConfig = {
  routingKeyAgent: 'patientCPF',
  name: 'PatientCPFAgent'
};

const PatientEmailAgent: AgentConfig = {
  routingKeyAgent: 'patientEmail',
  name: 'PatientEmailAgent'
};

// Função para obter o próximo agente no fluxo
function getNextAgent(currentAgent: string): string | null {
  const currentIndex = globalMemory.flow.indexOf(currentAgent);
  if (currentIndex >= 0 && currentIndex < globalMemory.flow.length - 1) {
    return globalMemory.flow[currentIndex + 1] || null;
  }
  return null;
}

// Função para marcar sucesso na memória global
function markStepAsSuccess(phone: string, step: string, value: any): void {
  if (!globalMemory.currentStep[phone]) {
    globalMemory.currentStep[phone] = {};
  }
  if (!globalMemory.userData[phone]) {
    globalMemory.userData[phone] = {};
  }
  
  globalMemory.currentStep[phone][step] = 'success';
  globalMemory.userData[phone][step] = value;
  
  console.log(`✅ Step ${step} marked as success for phone ${phone}`);
  console.log(`📊 Global Memory:`, JSON.stringify(globalMemory, null, 2));
}

// Função para simular processamento de dados
function simulateDataProcessing(agentName: string, phone: string): string {
  const mockData: Record<string, string> = {
    'GreetingAgent': `Olá! Bem-vindo ao nosso sistema de atendimento. Telefone: ${phone}`,
    'PatientNameAgent': `João Silva`,
    'PatientCPFAgent': `123.456.789-00`,
    'PatientEmailAgent': `joao.silva@email.com`
  };
  
  return mockData[agentName] || `Dados processados por ${agentName}`;
}

async function testAgentsFlow(): Promise<void> {
  console.log('🧪 Teste de fluxo de agentes (baseado no wildcard que funcionou)...\n');
  
  let sdk: SdkRabbitmq | undefined;
  
  try {
    sdk = await SdkRabbitmq.getInstance();
    console.log('✅ SDK inicializado\n');
    
    // Configurar subscriber de monitoramento
    console.log('👂 Configurando monitor...');
    const monitorCallback: MessageCallback = (payload: MessagePayload, ack: () => void, nack: () => void) => {
      console.log('\n📱 MENSAGEM FINAL RECEBIDA NO MONITOR:');
      console.log('📄 Payload:', JSON.stringify(payload, null, 2));
      ack();
    };
    
    await sdk.subscribe('whatsapp.message.text', 'monitor-queue', 'send', monitorCallback);
    console.log('✅ Monitor configurado\n');
    
    // Configurar GreetingAgent
    console.log('🤖 Configurando GreetingAgent...');
    const greetingCallback: MessageCallback = (payload: MessagePayload, ack: () => void, nack: () => void) => {
      console.log('\n🤖 GreetingAgent processando:', JSON.stringify(payload, null, 2));
      
      const phone = payload.phone;
      const processedValue = simulateDataProcessing('GreetingAgent', phone);
      
      // Marcar como sucesso
      markStepAsSuccess(phone, 'greeting', processedValue);
      
      // Obter próximo agente
      const nextAgentKey = getNextAgent('greeting');
      
      if (nextAgentKey) {
        const nextPayload: MessagePayload = {
          phone: phone,
          timestamp: Date.now(),
          metadata: {
            identification: 'greeting',
            senderAgent: 'GreetingAgent',
            value: processedValue
          }
        };
        
        console.log(`📤 GreetingAgent enviando para: ${nextAgentKey}`);
        
        // Usar setTimeout para não bloquear o callback
        setTimeout(async () => {
          try {
            await sdk!.publish('test.agents', nextAgentKey, nextPayload);
          } catch (error) {
            console.error('❌ Erro ao enviar para próximo agente:', error);
          }
        }, 100);
      }
      
      ack();
    };
    
    await sdk.subscribe('test.wildcard', 'queue-greeting', 'phone.*', greetingCallback);
    console.log('✅ GreetingAgent configurado\n');
    
    // Configurar PatientNameAgent
    console.log('🤖 Configurando PatientNameAgent...');
    const nameCallback: MessageCallback = (payload: MessagePayload, ack: () => void, nack: () => void) => {
      console.log(`\n🤖 PatientNameAgent processando:`, JSON.stringify(payload, null, 2));
      
      const phone = payload.phone;
      const specificRoutingKey = `phone.${phone}`;
      const processedValue = simulateDataProcessing('PatientNameAgent', phone);
      
      // Marcar como sucesso
      markStepAsSuccess(phone, 'patientName', processedValue);
      
      // Fazer bind/unbind e enviar para próximo agente de forma assíncrona
      setTimeout(async () => {
        try {
          // Fazer bind específico
          await sdk!.bind('queue-patientName', 'test.wildcard', specificRoutingKey);
          console.log(`🔒 PatientNameAgent bind: ${specificRoutingKey}`);
          
          // Simular processamento
          await new Promise(resolve => setTimeout(resolve, 1000));
          
          // Fazer unbind
          await sdk!.unbind('queue-patientName', 'test.wildcard', specificRoutingKey);
          console.log(`🔓 PatientNameAgent unbind: ${specificRoutingKey}`);
          
          // Próximo agente
          const nextAgentKey = getNextAgent('patientName');
          
          if (nextAgentKey) {
            const nextPayload: MessagePayload = {
              phone: phone,
              timestamp: Date.now(),
              metadata: {
                identification: 'patientName',
                senderAgent: 'PatientNameAgent',
                value: processedValue
              }
            };
            
            console.log(`📤 PatientNameAgent enviando para: ${nextAgentKey}`);
            await sdk!.publish('test.agents', nextAgentKey, nextPayload);
          }
        } catch (error) {
          console.error('❌ Erro no PatientNameAgent:', error);
        }
      }, 100);
      
      ack();
    };
    
    await sdk.subscribe('test.agents', 'queue-patientName', 'patientName', nameCallback);
    console.log('✅ PatientNameAgent configurado\n');
    
    // Configurar PatientCPFAgent
    console.log('🤖 Configurando PatientCPFAgent...');
    const cpfCallback: MessageCallback = (payload: MessagePayload, ack: () => void, nack: () => void) => {
      console.log(`\n🤖 PatientCPFAgent processando:`, JSON.stringify(payload, null, 2));
      
      const phone = payload.phone;
      const specificRoutingKey = `phone.${phone}`;
      const processedValue = simulateDataProcessing('PatientCPFAgent', phone);
      
      // Marcar como sucesso
      markStepAsSuccess(phone, 'patientCPF', processedValue);
      
      // Fazer bind/unbind e enviar para próximo agente de forma assíncrona
      setTimeout(async () => {
        try {
          // Fazer bind específico
          await sdk!.bind('queue-patientCPF', 'test.wildcard', specificRoutingKey);
          console.log(`🔒 PatientCPFAgent bind: ${specificRoutingKey}`);
          
          // Simular processamento
          await new Promise(resolve => setTimeout(resolve, 1000));
          
          // Fazer unbind
          await sdk!.unbind('queue-patientCPF', 'test.wildcard', specificRoutingKey);
          console.log(`🔓 PatientCPFAgent unbind: ${specificRoutingKey}`);
          
          // Próximo agente
          const nextAgentKey = getNextAgent('patientCPF');
          
          if (nextAgentKey) {
            const nextPayload: MessagePayload = {
              phone: phone,
              timestamp: Date.now(),
              metadata: {
                identification: 'patientCPF',
                senderAgent: 'PatientCPFAgent',
                value: processedValue
              }
            };
            
            console.log(`📤 PatientCPFAgent enviando para: ${nextAgentKey}`);
            await sdk!.publish('test.agents', nextAgentKey, nextPayload);
          }
        } catch (error) {
          console.error('❌ Erro no PatientCPFAgent:', error);
        }
      }, 100);
      
      ack();
    };
    
    await sdk.subscribe('test.agents', 'queue-patientCPF', 'patientCPF', cpfCallback);
    console.log('✅ PatientCPFAgent configurado\n');
    
    // Configurar PatientEmailAgent
    console.log('🤖 Configurando PatientEmailAgent...');
    const emailCallback: MessageCallback = (payload: MessagePayload, ack: () => void, nack: () => void) => {
      console.log(`\n🤖 PatientEmailAgent processando:`, JSON.stringify(payload, null, 2));
      
      const phone = payload.phone;
      const specificRoutingKey = `phone.${phone}`;
      const processedValue = simulateDataProcessing('PatientEmailAgent', phone);
      
      // Marcar como sucesso
      markStepAsSuccess(phone, 'patientEmail', processedValue);
      
      // Fazer bind/unbind e finalizar fluxo de forma assíncrona
      setTimeout(async () => {
        try {
          // Fazer bind específico
          await sdk!.bind('queue-patientEmail', 'test.wildcard', specificRoutingKey);
          console.log(`🔒 PatientEmailAgent bind: ${specificRoutingKey}`);
          
          // Simular processamento
          await new Promise(resolve => setTimeout(resolve, 1000));
          
          // Fazer unbind
          await sdk!.unbind('queue-patientEmail', 'test.wildcard', specificRoutingKey);
          console.log(`🔓 PatientEmailAgent unbind: ${specificRoutingKey}`);
          
          // Finalizar fluxo - enviar para monitor
          console.log(`🏁 PatientEmailAgent finalizando fluxo para ${phone}`);
          
          const finalPayload: MessagePayload = {
            phone: phone,
            timestamp: Date.now(),
            metadata: {
              identification: 'flow_completed',
              senderAgent: 'PatientEmailAgent',
              value: 'Fluxo completo finalizado',
              userData: globalMemory.userData[phone] || {}
            }
          };
          
          await sdk!.publish('whatsapp.message.text', 'send', finalPayload);
        } catch (error) {
          console.error('❌ Erro no PatientEmailAgent:', error);
        }
      }, 100);
      
      ack();
    };
    
    await sdk.subscribe('test.agents', 'queue-patientEmail', 'patientEmail', emailCallback);
    console.log('✅ PatientEmailAgent configurado\n');
    
    // Aguardar configuração (baseado no teste que funcionou)
    console.log('⏳ Aguardando 5 segundos para todos os agentes ficarem ativos...');
    await new Promise<void>(resolve => setTimeout(resolve, 5000));
    
    // Enviar mensagens de teste
    console.log('\n📞 Iniciando fluxo para telefones...');
    
    const testPhones = ['5511999999999', '5511888888888'];
    
    for (const phone of testPhones) {
      console.log(`\n🔥 Iniciando fluxo para telefone: ${phone}`);
      
      const initialPayload: MessagePayload = {
        phone: phone,
        timestamp: Date.now(),
        metadata: {
          identification: 'initial',
          senderAgent: 'TestSystem',
          value: 'Mensagem inicial do WhatsApp'
        }
      };
      
      await sdk.publish('test.wildcard', `phone.${phone}`, initialPayload);
      
      // Aguardar entre telefones
      await new Promise<void>(resolve => setTimeout(resolve, 3000));
    }
    
    // Aguardar processamento completo
    console.log('\n⏳ Aguardando processamento completo (20 segundos)...');
    await new Promise<void>(resolve => setTimeout(resolve, 20000));
    
    console.log('\n🎉 Teste concluído!');
    console.log('\n📊 Estado final da memória global:');
    console.log(JSON.stringify(globalMemory, null, 2));
    
  } catch (error) {
    console.error('❌ Erro:', error);
  } finally {
    if (sdk) {
      await sdk.disconnect();
    }
  }
}

if (require.main === module) {
  testAgentsFlow().catch(console.error);
}

export { testAgentsFlow };