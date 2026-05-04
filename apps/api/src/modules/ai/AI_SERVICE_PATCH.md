// =============================================================
// PATCH PARA apps/api/src/modules/ai/ai.service.ts
// =============================================================
// Mudanças mínimas: passar ctx (conversationId, contactId) ao
// chamar this.tools.execute(). O resto do arquivo permanece igual.
// =============================================================

// 1. Acrescente contactId em GenerateReplyParams:

interface GenerateReplyParams {
  tenantId: string;
  conversationId: string;
  contactId?: string;            // ADICIONAR
  userMessage: string;
  instructions?: string;
  intent?: MessageIntent;
}

// 2. Dentro do for-loop de iterations, na chamada a execute():

// ANTES:
//   const { value: result, durationMs } = await timed(() =>
//     this.tools.execute(params.tenantId, toolCall.name, toolCall.input),
//   );

// DEPOIS:
const { value: result, durationMs } = await timed(() =>
  this.tools.execute(params.tenantId, toolCall.name, toolCall.input, {
    conversationId: params.conversationId,
    contactId: params.contactId,
  }),
);

// 3. Em automations.service.ts, ao chamar generateReply, passar contactId:

await this.ai.generateReply({
  tenantId: ctx.tenantId,
  conversationId: ctx.conversationId,
  contactId: ctx.contactId,       // ADICIONAR (já existe em IncomingMessageContext)
  userMessage: ctx.messageText,
  instructions: settings.aiInstructions ?? undefined,
  intent: intentResult.intent,
});
