import { SdkRabbitmq } from '../src/components/SdkRabbitmq';
import { MessageCallback } from '../src/interfaces/IMessage';

async function testSimpleGreeting(): Promise<void> {
  console.log('🧪 Teste simples do GreetingAgent...\n');
  
  let sdk: SdkRabbitmq | undefined;
  
  try {
    // Inicializar SDK
    sdk = await SdkRabbitmq.getInstance();
    console.log('✅ SDK inicializado\n');
    
    // Configurar subscriber simples
    console.log('👂 Configurando subscriber...');
    
    const callback: MessageCallback = (payload: any, ack: () => void, nack: () => void) => {
      console.log('\n🎉 MENSAGEM RECEBIDA!');
      console.log('📄 Payload:', JSON.stringify(payload, null, 2));
      ack();
    };
    
    await sdk.subscribe(
      'chatbot.whatsapp',
      'test-queue',
      'phone.*',
      callback
    );
    
    console.log('✅ Subscriber configurado');
    
    // Aguardar configuração
    console.log('\n⏳ Aguardando 3 segundos...');
    await new Promise<void>(resolve => setTimeout(resolve, 3000));
    
    // Enviar mensagem de teste
    console.log('\n📤 Enviando mensagem de teste...');
    const testPayload = {
      phone: '5511999999999',
      timestamp: Date.now(),
      message: 'Teste simples'
    };
    
    const published = await sdk.publish('chatbot.whatsapp', 'phone.5511999999999', testPayload);
    console.log('📊 Publicado:', published);
    
    // Aguardar processamento
    console.log('\n⏳ Aguardando processamento...');
    await new Promise<void>(resolve => setTimeout(resolve, 5000));
    
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
  testSimpleGreeting().catch(console.error);
}

export { testSimpleGreeting };