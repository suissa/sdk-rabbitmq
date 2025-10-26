import { SdkRabbitmq } from '../src/components/SdkRabbitmq';
import { MessageCallback } from '../src/interfaces/IMessage';

async function testSameChannel(): Promise<void> {
  console.log('🧪 Teste com mesmo channel...\n');
  
  let sdk: SdkRabbitmq | undefined;
  
  try {
    // Inicializar SDK
    sdk = await SdkRabbitmq.getInstance();
    console.log('✅ SDK inicializado\n');
    
    // Configurar subscriber PRIMEIRO
    console.log('👂 Configurando subscriber...');
    
    let messageReceived = false;
    const callback: MessageCallback = (payload: any, ack: () => void, nack: () => void) => {
      console.log('\n🎉 MENSAGEM RECEBIDA NO CALLBACK!');
      console.log('📄 Payload:', JSON.stringify(payload, null, 2));
      messageReceived = true;
      ack();
    };
    
    await sdk.subscribe(
      'test.same.channel',
      'same-channel-queue',
      'test.*',
      callback
    );
    
    console.log('✅ Subscriber configurado');
    
    // Aguardar mais tempo para garantir que o subscriber está ativo
    console.log('\n⏳ Aguardando 5 segundos para subscriber ficar ativo...');
    await new Promise<void>(resolve => setTimeout(resolve, 5000));
    
    // Enviar mensagem DEPOIS
    console.log('\n📤 Enviando mensagem...');
    const testPayload = {
      test: 'same-channel',
      timestamp: Date.now()
    };
    
    const published = await sdk.publish('test.same.channel', 'test.message', testPayload);
    console.log('📊 Publicado:', published);
    
    // Aguardar processamento com timeout
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
      console.log('\n✅ SUCESSO! Mensagem foi recebida');
    } else {
      console.log('\n❌ FALHA! Mensagem não foi recebida');
    }
    
    console.log('\n🏁 Teste concluído');
    
  } catch (error) {
    console.error('❌ Erro:', error);
  } finally {
    if (sdk) {
      console.log('\n🔌 Desconectando...');
      await sdk.disconnect();
    }
  }
}

if (require.main === module) {
  testSameChannel().catch(console.error);
}

export { testSameChannel };