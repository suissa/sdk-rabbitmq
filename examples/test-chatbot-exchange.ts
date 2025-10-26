import { SdkRabbitmq } from '../src/components/SdkRabbitmq';
import { MessageCallback } from '../src/interfaces/IMessage';

async function testChatbotExchange(): Promise<void> {
  console.log('🧪 Teste específico da exchange chatbot.whatsapp...\n');
  
  let sdk: SdkRabbitmq | undefined;
  
  try {
    sdk = await SdkRabbitmq.getInstance();
    console.log('✅ SDK inicializado\n');
    
    let messageReceived = false;
    const callback: MessageCallback = (payload: any, ack: () => void, nack: () => void) => {
      console.log('\n🎉 MENSAGEM RECEBIDA NA EXCHANGE CHATBOT!');
      console.log('📄 Payload:', JSON.stringify(payload, null, 2));
      messageReceived = true;
      ack();
    };
    
    // Usar exatamente a mesma configuração do teste original
    console.log('👂 Configurando GreetingAgent...');
    await sdk.subscribe(
      'chatbot.whatsapp',
      'queue-greeting',
      'phone.*',
      callback
    );
    
    console.log('✅ GreetingAgent configurado');
    
    // Aguardar tempo suficiente
    console.log('\n⏳ Aguardando 5 segundos...');
    await new Promise<void>(resolve => setTimeout(resolve, 5000));
    
    // Enviar mensagem exatamente como no teste original
    console.log('\n📤 Enviando mensagem para chatbot.whatsapp...');
    const testPayload = {
      phone: '5511999999999',
      timestamp: Date.now(),
      metadata: {
        identification: 'initial',
        senderAgent: 'TestSystem',
        value: 'Mensagem inicial do WhatsApp'
      }
    };
    
    const published = await sdk.publish('chatbot.whatsapp', 'phone.5511999999999', testPayload);
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
      console.log('\n✅ SUCESSO! Exchange chatbot.whatsapp funciona');
    } else {
      console.log('\n❌ FALHA! Exchange chatbot.whatsapp não funciona');
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
  testChatbotExchange().catch(console.error);
}

export { testChatbotExchange };