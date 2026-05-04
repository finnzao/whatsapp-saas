export const QUEUE_NAMES = {
  INBOUND_MESSAGES: 'inbound-messages',
  OUTBOUND_MESSAGES: 'outbound-messages',
  AI_PROCESSING: 'ai-processing',
  DEBOUNCED_PROCESSING: 'debounced-processing',
  EMBEDDINGS: 'embeddings',
} as const;

export const JOB_NAMES = {
  PROCESS_INBOUND: 'process-inbound',
  SEND_MESSAGE: 'send-message',
  CLASSIFY_AND_REPLY: 'classify-and-reply',
  PROCESS_DEBOUNCED: 'process-debounced',
  EMBED_PRODUCT: 'embed-product',
  REEMBED_TENANT: 'reembed-tenant',
} as const;
