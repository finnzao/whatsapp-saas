export const APP_EVENTS = {
  OUTBOUND_MESSAGE_REQUESTED: 'message.outbound.requested',
  CONVERSATION_HANDOFF_REQUESTED: 'conversation.handoff.requested',
} as const;

export interface OutboundMessageRequestedEvent {
  tenantId: string;
  conversationId: string;
  contactId: string;
  text: string;
  fromBot: boolean;
}

export interface ConversationHandoffRequestedEvent {
  tenantId: string;
  conversationId: string;
  reason: string;
}
