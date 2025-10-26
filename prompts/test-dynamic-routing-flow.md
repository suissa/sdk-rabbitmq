quero que você crie um script, para testar as funções do sdk, com o seguinte teste: Fluxo de mensagens com roteamento dinamico

Basicamente um agente vai receber um payload que possui um phone que será utilizadopara ele ouvir na sua routingKey, processar a mensagem quando chegar nessa routingKey, dar unbind nessa routingKey, pegar o nome da routingKey do próximo Agente da memoria global, marcar como sucessso na sua posição do flow na memória global e enviar o payload para esse próximo Agent.

- crie 4 objetos chamados: GreetingAgent, PatientNameAgent, PatientCPFAgent e PatienEmailAgent
- contendo:
  - GreetingAgent.routingKeyAgent="greeting"
  - PatientNameAgent.routingKeyAgent="patientName" 
  - PatientCPFAgent.routingKeyAgent="patientCPF"
  - PatientEmailAgent.routingKeyAgent="patientEmail"
- crie 2 exchanges topic: "chatbot.whatsapp", "chatbot.agents"
- crie numa memoria global com o seguinte {flow: [ GreetingAgent.routingKey, PatientNameAgent.routingKey, PatientCPFAgent.routingKey]}
- crie o GreetingAgent que deve ouvir a exchange="chatbot.whatsapp" e a routingKey="phone.*"
- crie o PatientNameAgent que deve ouvir a exchange="chatbot.whatsapp" e a
  routingKey="phone.{telefone do usuario queo GreetinGAgent vai enviar}", depois de pegar o nome do usuario e guardar na memória, deve fazer o unbind dessa routingKey do numero desse cliente
- depoisa deve enviar o seguinte payload: 
```json
{phone: "xxx", timestamp: Date.now(), metadata: { identification: "name", senderAgent: "{agent name}", value: "{value processed}"" }}
```
- mesma coisa para o PatientCPFAgent e PatientEmail

Para testar:
- crie um publisher e um subscriber para exchange="whatsapp.message.text" e routingKey="send"
- acada Agent vai usar esse piblisher enviar seu payload 
- eosubscriber vai apenas colocar no Log e mostrar no terminal que chegou aquela mensagem