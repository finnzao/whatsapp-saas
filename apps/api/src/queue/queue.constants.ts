export const QUEUE_NAMES = {
  INBOUND_MESSAGES: 'inbound-messages',
  OUTBOUND_MESSAGES: 'outbound-messages',
  AI_PROCESSING: 'ai-processing',
} as const;

export const JOB_NAMES = {
  PROCESS_INBOUND: 'process-inbound',
  SEND_MESSAGE: 'send-message',
  CLASSIFY_AND_REPLY: 'classify-and-reply',
} as const;
