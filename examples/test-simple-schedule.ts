import { SdkRabbitmq } from '../src/components/SdkRabbitmq';
import { MessageCallback } from '../src/interfaces/IMessage';

async function testSimpleSchedule(): Promise<void> {
  console.log('🦷 Teste simples do GreetingAgent para agendamento...\n');
  
  let sdk: SdkRabbitmq | undefined;
  
  try {
    sdk = await SdkRabbitmq.getInstance();
    console.log('✅ SDK inicializado\n');
    
    let messageReceived = false;
    const callback: MessageCallback = (payload: any, ack: () => void, nack: () => void) => {
      console.log('\n🎉 GREETING AGENT RECEBEU MENSAGEM!');
      console.log('📄 Payload:', JSON.stringify(payload, null, 2));
      messageReceived = true;
      ack();
    };
    
    console.log('👂 Configurando GreetingAgent...');
    await sdk.subscribe('test.wildcard', 'queue-greeting-simple', 'phone.*', callback);
    console.log('✅ GreetingAgent configurado');
    
    // Aguardar configuração
    console.log('\n⏳ Aguardando 3 segundos...');
    await new Promise<void>(resolve => setTimeout(resolve, 3000));
    
    // Enviar mensagem de teste
    console.log('\n📤 Enviando mensagem de teste...');
    const testPayload = {
      phone: '5511999991111',
      timestamp: Date.now(),
      metadata: {
        identification: 'initial',
        senderAgent: 'TestSystem',
        value: 'Mensagem inicial do sistema de agendamento'
      }
    };
    
    const published = await sdk.publish('test.wildcard', 'phone.5511999991111', testPayload);
    console.log('📊 Publicado:', published);
    
    // Aguardar processamento
    console.log('\n⏳ Aguardando processamento (10 segundos)...');
    let waitTime = 0;
    while (!messageReceived && waitTime < 10000) {
      await new Promise<void>(resolve => setTimeout(resolve, 500));
      waitTime += 500;
      if (waitTime % 2000 === 0) {
        console.log(`⏰ Aguardando... ${waitTime/1000}s`);
      }
    }
    
    if (messageReceived) {
      console.log('\n✅ SUCESSO! GreetingAgent está funcionando');
    } else {
      console.log('\n❌ FALHA! GreetingAgent não recebeu mensagem');
    }
    
    console.log('\n🏁 Teste concluído');
    
  } catch (error) {
    console.error('❌ Erro:', error);
  } finally {
    if (sdk) {
      await sdk.disconnect();
    }
  }
}

if (require.main === module) {
  testSimpleSchedule().catch(console.error);
}

export { testSimpleSchedule };