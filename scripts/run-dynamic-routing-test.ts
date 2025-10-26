#!/usr/bin/env ts-node

/**
 * Script para executar o teste de fluxo de roteamento dinâmico
 * 
 * Uso:
 * npm run build && npx ts-node scripts/run-dynamic-routing-test.ts
 * 
 * Ou compile primeiro:
 * npm run build && node dist/examples/test-dynamic-routing-flow.js
 */

import { testDynamicRoutingFlow } from '../examples/test-dynamic-routing-flow';

async function main(): Promise<void> {
  console.log('🚀 Executando teste de fluxo de roteamento dinâmico...\n');
  
  try {
    await testDynamicRoutingFlow();
    console.log('\n✅ Teste executado com sucesso!');
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Erro durante a execução do teste:', error);
    process.exit(1);
  }
}

// Executar apenas se este arquivo for chamado diretamente
if (require.main === module) {
  main();
}