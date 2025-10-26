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
  scheduleFlow: Record<string, string[]>; // Fluxo dinâmico baseado na escolha
}

interface MessagePayload {
  phone: string;
  timestamp: number;
  metadata: {
    identification: string;
    senderAgent: string;
    value: string;
    userData?: Record<string, any>;
    choice?: string; // Para escolhas do usuário
  };
}

// Memória global para controlar o fluxo
const globalMemory: GlobalMemory = {
  flow: ['greeting', 'patientName', 'patientCPF', 'patientEmail', 'patientBirthDate', 'scheduleNew'],
  currentStep: {},
  userData: {},
  scheduleFlow: {} // Será preenchido dinamicamente baseado na escolha
};

// Definição dos agentes básicos
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

const PatientBirthDateAgent: AgentConfig = {
  routingKeyAgent: 'patientBirthDate',
  name: 'PatientBirthDateAgent'
};

// Novos agentes de agendamento
const ScheduleNewAgent: AgentConfig = {
  routingKeyAgent: 'scheduleNew',
  name: 'ScheduleNewAgent'
};

const ScheduleDateAgent: AgentConfig = {
  routingKeyAgent: 'scheduleDate',
  name: 'ScheduleDateAgent'
};

const ScheduleDentistAgent: AgentConfig = {
  routingKeyAgent: 'scheduleDentist',
  name: 'ScheduleDentistAgent'
};

const ScheduleServiceAgent: AgentConfig = {
  routingKeyAgent: 'scheduleService',
  name: 'ScheduleServiceAgent'
};

// Função para obter o próximo agente no fluxo
function getNextAgent(currentAgent: string, phone: string): string | null {
  // Para o fluxo básico
  const currentIndex = globalMemory.flow.indexOf(currentAgent);
  if (currentIndex >= 0 && currentIndex < globalMemory.flow.length - 1) {
    return globalMemory.flow[currentIndex + 1] || null;
  }
  
  // Para o fluxo de agendamento dinâmico
  if (globalMemory.scheduleFlow[phone]) {
    const scheduleFlow = globalMemory.scheduleFlow[phone];
    const scheduleIndex = scheduleFlow.indexOf(currentAgent);
    if (scheduleIndex >= 0 && scheduleIndex < scheduleFlow.length - 1) {
      return scheduleFlow[scheduleIndex + 1] || null;
    }
  }
  
  return null;
}

// Função para definir o fluxo de agendamento baseado na escolha
function setScheduleFlow(phone: string, choice: string): void {
  switch (choice) {
    case '1': // Data primeiro
      globalMemory.scheduleFlow[phone] = ['scheduleDate', 'scheduleDentist', 'scheduleService'];
      break;
    case '2': // Dentista primeiro
      globalMemory.scheduleFlow[phone] = ['scheduleDentist', 'scheduleDate', 'scheduleService'];
      break;
    case '3': // Serviço primeiro
      globalMemory.scheduleFlow[phone] = ['scheduleService', 'scheduleDentist', 'scheduleDate'];
      break;
    default:
      globalMemory.scheduleFlow[phone] = ['scheduleDate', 'scheduleDentist', 'scheduleService'];
  }
  
  console.log(`📋 Fluxo de agendamento definido para ${phone}:`, globalMemory.scheduleFlow[phone]);
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
}

// Função para simular processamento de dados
function simulateDataProcessing(agentName: string, phone: string): string {
  const mockData: Record<string, string> = {
    'GreetingAgent': `Olá! Bem-vindo ao nosso sistema de agendamento. Telefone: ${phone}`,
    'PatientNameAgent': `Maria Silva`,
    'PatientCPFAgent': `987.654.321-00`,
    'PatientEmailAgent': `maria.silva@email.com`,
    'PatientBirthDateAgent': `15/03/1985`,
    'ScheduleNewAgent': `Vamos agendar sua consulta!`,
    'ScheduleDateAgent': `25/11/2024 às 14:00`,
    'ScheduleDentistAgent': `Dr. João Santos`,
    'ScheduleServiceAgent': `Limpeza e Check-up`
  };
  
  return mockData[agentName] || `Dados processados por ${agentName}`;
}

async function testScheduleFlow(): Promise<void> {
  console.log('🦷 Teste de fluxo de agendamento odontológico...\n');
  
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
      
      markStepAsSuccess(phone, 'greeting', processedValue);
      
      const nextAgentKey = getNextAgent('greeting', phone);
      
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
      const processedValue = simulateDataProcessing('PatientNameAgent', phone);
      
      markStepAsSuccess(phone, 'patientName', processedValue);
      
      setTimeout(async () => {
        try {
          const specificRoutingKey = `phone.${phone}`;
          await sdk!.bind('queue-patientName', 'test.wildcard', specificRoutingKey);
          console.log(`🔒 PatientNameAgent bind: ${specificRoutingKey}`);
          
          await new Promise(resolve => setTimeout(resolve, 1000));
          
          await sdk!.unbind('queue-patientName', 'test.wildcard', specificRoutingKey);
          console.log(`🔓 PatientNameAgent unbind: ${specificRoutingKey}`);
          
          const nextAgentKey = getNextAgent('patientName', phone);
          
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
      const processedValue = simulateDataProcessing('PatientCPFAgent', phone);
      
      markStepAsSuccess(phone, 'patientCPF', processedValue);
      
      setTimeout(async () => {
        try {
          const specificRoutingKey = `phone.${phone}`;
          await sdk!.bind('queue-patientCPF', 'test.wildcard', specificRoutingKey);
          console.log(`🔒 PatientCPFAgent bind: ${specificRoutingKey}`);
          
          await new Promise(resolve => setTimeout(resolve, 1000));
          
          await sdk!.unbind('queue-patientCPF', 'test.wildcard', specificRoutingKey);
          console.log(`🔓 PatientCPFAgent unbind: ${specificRoutingKey}`);
          
          const nextAgentKey = getNextAgent('patientCPF', phone);
          
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
      const processedValue = simulateDataProcessing('PatientEmailAgent', phone);
      
      markStepAsSuccess(phone, 'patientEmail', processedValue);
      
      setTimeout(async () => {
        try {
          const specificRoutingKey = `phone.${phone}`;
          await sdk!.bind('queue-patientEmail', 'test.wildcard', specificRoutingKey);
          console.log(`🔒 PatientEmailAgent bind: ${specificRoutingKey}`);
          
          await new Promise(resolve => setTimeout(resolve, 1000));
          
          await sdk!.unbind('queue-patientEmail', 'test.wildcard', specificRoutingKey);
          console.log(`🔓 PatientEmailAgent unbind: ${specificRoutingKey}`);
          
          const nextAgentKey = getNextAgent('patientEmail', phone);
          
          if (nextAgentKey) {
            const nextPayload: MessagePayload = {
              phone: phone,
              timestamp: Date.now(),
              metadata: {
                identification: 'patientEmail',
                senderAgent: 'PatientEmailAgent',
                value: processedValue
              }
            };
            
            console.log(`📤 PatientEmailAgent enviando para: ${nextAgentKey}`);
            await sdk!.publish('test.agents', nextAgentKey, nextPayload);
          }
        } catch (error) {
          console.error('❌ Erro no PatientEmailAgent:', error);
        }
      }, 100);
      
      ack();
    };
    
    await sdk.subscribe('test.agents', 'queue-patientEmail', 'patientEmail', emailCallback);
    console.log('✅ PatientEmailAgent configurado\n');
    
    // Configurar PatientBirthDateAgent
    console.log('🤖 Configurando PatientBirthDateAgent...');
    const birthDateCallback: MessageCallback = (payload: MessagePayload, ack: () => void, nack: () => void) => {
      console.log(`\n🤖 PatientBirthDateAgent processando:`, JSON.stringify(payload, null, 2));
      
      const phone = payload.phone;
      const processedValue = simulateDataProcessing('PatientBirthDateAgent', phone);
      
      markStepAsSuccess(phone, 'patientBirthDate', processedValue);
      
      setTimeout(async () => {
        try {
          const specificRoutingKey = `phone.${phone}`;
          await sdk!.bind('queue-patientBirthDate', 'test.wildcard', specificRoutingKey);
          console.log(`🔒 PatientBirthDateAgent bind: ${specificRoutingKey}`);
          
          await new Promise(resolve => setTimeout(resolve, 1000));
          
          await sdk!.unbind('queue-patientBirthDate', 'test.wildcard', specificRoutingKey);
          console.log(`🔓 PatientBirthDateAgent unbind: ${specificRoutingKey}`);
          
          const nextAgentKey = getNextAgent('patientBirthDate', phone);
          
          if (nextAgentKey) {
            const nextPayload: MessagePayload = {
              phone: phone,
              timestamp: Date.now(),
              metadata: {
                identification: 'patientBirthDate',
                senderAgent: 'PatientBirthDateAgent',
                value: processedValue
              }
            };
            
            console.log(`📤 PatientBirthDateAgent enviando para: ${nextAgentKey}`);
            await sdk!.publish('test.agents', nextAgentKey, nextPayload);
          }
        } catch (error) {
          console.error('❌ Erro no PatientBirthDateAgent:', error);
        }
      }, 100);
      
      ack();
    };
    
    await sdk.subscribe('test.agents', 'queue-patientBirthDate', 'patientBirthDate', birthDateCallback);
    console.log('✅ PatientBirthDateAgent configurado\n');
    
    // Configurar ScheduleNewAgent
    console.log('🤖 Configurando ScheduleNewAgent...');
    const scheduleNewCallback: MessageCallback = (payload: MessagePayload, ack: () => void, nack: () => void) => {
      console.log(`\n🤖 ScheduleNewAgent processando:`, JSON.stringify(payload, null, 2));
      
      const phone = payload.phone;
      const processedValue = "Você prefere iniciar escolhendo o que?\n1) A data da consulta\n2) O dentista\n3) O serviço desejado";
      
      markStepAsSuccess(phone, 'scheduleNew', processedValue);
      
      // Simular escolha do usuário baseada no telefone (para teste)
      let choice = '1'; // Padrão
      if (phone.endsWith('1111')) choice = '1'; // Data primeiro
      if (phone.endsWith('2222')) choice = '2'; // Dentista primeiro  
      if (phone.endsWith('3333')) choice = '3'; // Serviço primeiro
      
      console.log(`🎯 Usuário ${phone} escolheu opção: ${choice}`);
      
      // Definir fluxo baseado na escolha
      setScheduleFlow(phone, choice);
      
      setTimeout(async () => {
        try {
          const specificRoutingKey = `phone.${phone}`;
          await sdk!.bind('queue-scheduleNew', 'test.wildcard', specificRoutingKey);
          console.log(`🔒 ScheduleNewAgent bind: ${specificRoutingKey}`);
          
          await new Promise(resolve => setTimeout(resolve, 1000));
          
          await sdk!.unbind('queue-scheduleNew', 'test.wildcard', specificRoutingKey);
          console.log(`🔓 ScheduleNewAgent unbind: ${specificRoutingKey}`);
          
          // Obter primeiro agente do fluxo de agendamento
          const nextAgentKey = globalMemory.scheduleFlow[phone]?.[0];
          
          if (nextAgentKey) {
            const nextPayload: MessagePayload = {
              phone: phone,
              timestamp: Date.now(),
              metadata: {
                identification: 'scheduleNew',
                senderAgent: 'ScheduleNewAgent',
                value: processedValue,
                choice: choice
              }
            };
            
            console.log(`📤 ScheduleNewAgent enviando para: ${nextAgentKey}`);
            await sdk!.publish('test.agents', nextAgentKey, nextPayload);
          }
        } catch (error) {
          console.error('❌ Erro no ScheduleNewAgent:', error);
        }
      }, 100);
      
      ack();
    };
    
    await sdk.subscribe('test.agents', 'queue-scheduleNew', 'scheduleNew', scheduleNewCallback);
    console.log('✅ ScheduleNewAgent configurado\n');
    
    // Configurar ScheduleDateAgent
    console.log('🤖 Configurando ScheduleDateAgent...');
    const scheduleDateCallback: MessageCallback = (payload: MessagePayload, ack: () => void, nack: () => void) => {
      console.log(`\n🤖 ScheduleDateAgent processando:`, JSON.stringify(payload, null, 2));
      
      const phone = payload.phone;
      const processedValue = simulateDataProcessing('ScheduleDateAgent', phone);
      
      markStepAsSuccess(phone, 'scheduleDate', processedValue);
      
      setTimeout(async () => {
        try {
          const specificRoutingKey = `phone.${phone}`;
          await sdk!.bind('queue-scheduleDate', 'test.wildcard', specificRoutingKey);
          console.log(`🔒 ScheduleDateAgent bind: ${specificRoutingKey}`);
          
          await new Promise(resolve => setTimeout(resolve, 1000));
          
          await sdk!.unbind('queue-scheduleDate', 'test.wildcard', specificRoutingKey);
          console.log(`🔓 ScheduleDateAgent unbind: ${specificRoutingKey}`);
          
          const nextAgentKey = getNextAgent('scheduleDate', phone);
          
          if (nextAgentKey) {
            const nextPayload: MessagePayload = {
              phone: phone,
              timestamp: Date.now(),
              metadata: {
                identification: 'scheduleDate',
                senderAgent: 'ScheduleDateAgent',
                value: processedValue
              }
            };
            
            console.log(`📤 ScheduleDateAgent enviando para: ${nextAgentKey}`);
            await sdk!.publish('test.agents', nextAgentKey, nextPayload);
          } else {
            // Finalizar fluxo
            console.log(`🏁 ScheduleDateAgent finalizando fluxo para ${phone}`);
            
            const finalPayload: MessagePayload = {
              phone: phone,
              timestamp: Date.now(),
              metadata: {
                identification: 'schedule_completed',
                senderAgent: 'ScheduleDateAgent',
                value: 'Agendamento completo finalizado',
                userData: globalMemory.userData[phone] || {}
              }
            };
            
            await sdk!.publish('whatsapp.message.text', 'send', finalPayload);
          }
        } catch (error) {
          console.error('❌ Erro no ScheduleDateAgent:', error);
        }
      }, 100);
      
      ack();
    };
    
    await sdk.subscribe('test.agents', 'queue-scheduleDate', 'scheduleDate', scheduleDateCallback);
    console.log('✅ ScheduleDateAgent configurado\n');
    
    // Configurar ScheduleDentistAgent
    console.log('🤖 Configurando ScheduleDentistAgent...');
    const scheduleDentistCallback: MessageCallback = (payload: MessagePayload, ack: () => void, nack: () => void) => {
      console.log(`\n🤖 ScheduleDentistAgent processando:`, JSON.stringify(payload, null, 2));
      
      const phone = payload.phone;
      const processedValue = simulateDataProcessing('ScheduleDentistAgent', phone);
      
      markStepAsSuccess(phone, 'scheduleDentist', processedValue);
      
      setTimeout(async () => {
        try {
          const specificRoutingKey = `phone.${phone}`;
          await sdk!.bind('queue-scheduleDentist', 'test.wildcard', specificRoutingKey);
          console.log(`🔒 ScheduleDentistAgent bind: ${specificRoutingKey}`);
          
          await new Promise(resolve => setTimeout(resolve, 1000));
          
          await sdk!.unbind('queue-scheduleDentist', 'test.wildcard', specificRoutingKey);
          console.log(`🔓 ScheduleDentistAgent unbind: ${specificRoutingKey}`);
          
          const nextAgentKey = getNextAgent('scheduleDentist', phone);
          
          if (nextAgentKey) {
            const nextPayload: MessagePayload = {
              phone: phone,
              timestamp: Date.now(),
              metadata: {
                identification: 'scheduleDentist',
                senderAgent: 'ScheduleDentistAgent',
                value: processedValue
              }
            };
            
            console.log(`📤 ScheduleDentistAgent enviando para: ${nextAgentKey}`);
            await sdk!.publish('test.agents', nextAgentKey, nextPayload);
          } else {
            // Finalizar fluxo
            console.log(`🏁 ScheduleDentistAgent finalizando fluxo para ${phone}`);
            
            const finalPayload: MessagePayload = {
              phone: phone,
              timestamp: Date.now(),
              metadata: {
                identification: 'schedule_completed',
                senderAgent: 'ScheduleDentistAgent',
                value: 'Agendamento completo finalizado',
                userData: globalMemory.userData[phone] || {}
              }
            };
            
            await sdk!.publish('whatsapp.message.text', 'send', finalPayload);
          }
        } catch (error) {
          console.error('❌ Erro no ScheduleDentistAgent:', error);
        }
      }, 100);
      
      ack();
    };
    
    await sdk.subscribe('test.agents', 'queue-scheduleDentist', 'scheduleDentist', scheduleDentistCallback);
    console.log('✅ ScheduleDentistAgent configurado\n');
    
    // Configurar ScheduleServiceAgent
    console.log('🤖 Configurando ScheduleServiceAgent...');
    const scheduleServiceCallback: MessageCallback = (payload: MessagePayload, ack: () => void, nack: () => void) => {
      console.log(`\n🤖 ScheduleServiceAgent processando:`, JSON.stringify(payload, null, 2));
      
      const phone = payload.phone;
      const processedValue = simulateDataProcessing('ScheduleServiceAgent', phone);
      
      markStepAsSuccess(phone, 'scheduleService', processedValue);
      
      setTimeout(async () => {
        try {
          const specificRoutingKey = `phone.${phone}`;
          await sdk!.bind('queue-scheduleService', 'test.wildcard', specificRoutingKey);
          console.log(`🔒 ScheduleServiceAgent bind: ${specificRoutingKey}`);
          
          await new Promise(resolve => setTimeout(resolve, 1000));
          
          await sdk!.unbind('queue-scheduleService', 'test.wildcard', specificRoutingKey);
          console.log(`🔓 ScheduleServiceAgent unbind: ${specificRoutingKey}`);
          
          const nextAgentKey = getNextAgent('scheduleService', phone);
          
          if (nextAgentKey) {
            const nextPayload: MessagePayload = {
              phone: phone,
              timestamp: Date.now(),
              metadata: {
                identification: 'scheduleService',
                senderAgent: 'ScheduleServiceAgent',
                value: processedValue
              }
            };
            
            console.log(`📤 ScheduleServiceAgent enviando para: ${nextAgentKey}`);
            await sdk!.publish('test.agents', nextAgentKey, nextPayload);
          } else {
            // Finalizar fluxo
            console.log(`🏁 ScheduleServiceAgent finalizando fluxo para ${phone}`);
            
            const finalPayload: MessagePayload = {
              phone: phone,
              timestamp: Date.now(),
              metadata: {
                identification: 'schedule_completed',
                senderAgent: 'ScheduleServiceAgent',
                value: 'Agendamento completo finalizado',
                userData: globalMemory.userData[phone] || {}
              }
            };
            
            await sdk!.publish('whatsapp.message.text', 'send', finalPayload);
          }
        } catch (error) {
          console.error('❌ Erro no ScheduleServiceAgent:', error);
        }
      }, 100);
      
      ack();
    };
    
    await sdk.subscribe('test.agents', 'queue-scheduleService', 'scheduleService', scheduleServiceCallback);
    console.log('✅ ScheduleServiceAgent configurado\n');
    
    // Aguardar configuração
    console.log('⏳ Aguardando 5 segundos para todos os agentes ficarem ativos...');
    await new Promise<void>(resolve => setTimeout(resolve, 5000));
    
    // Enviar mensagens de teste para os 3 cenários
    console.log('\n🦷 Iniciando fluxo para os 3 cenários de agendamento...');
    
    const testPhones = [
      '5511999991111', // Escolherá opção 1 (Data primeiro)
      '5511999992222', // Escolherá opção 2 (Dentista primeiro)
      '5511999993333'  // Escolherá opção 3 (Serviço primeiro)
    ];
    
    for (const phone of testPhones) {
      console.log(`\n🔥 Iniciando fluxo para telefone: ${phone}`);
      
      const initialPayload: MessagePayload = {
        phone: phone,
        timestamp: Date.now(),
        metadata: {
          identification: 'initial',
          senderAgent: 'TestSystem',
          value: 'Mensagem inicial do sistema de agendamento'
        }
      };
      
      await sdk.publish('test.wildcard', `phone.${phone}`, initialPayload);
      
      // Aguardar entre telefones
      await new Promise<void>(resolve => setTimeout(resolve, 5000));
    }
    
    // Aguardar processamento completo
    console.log('\n⏳ Aguardando processamento completo (30 segundos)...');
    await new Promise<void>(resolve => setTimeout(resolve, 30000));
    
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
  testScheduleFlow().catch(console.error);
}

export { testScheduleFlow };