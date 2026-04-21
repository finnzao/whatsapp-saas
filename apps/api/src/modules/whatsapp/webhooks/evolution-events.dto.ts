/**
 * Tipos dos eventos que a Evolution API envia via webhook.
 * Referência: https://doc.evolution-api.com/v2/api-reference/webhook/set-webhook
 */

export interface EvolutionWebhookEvent {
  event: string;
  instance: string;
  data: any;
  destination?: string;
  date_time?: string;
  sender?: string;
  server_url?: string;
  apikey?: string;
}

export interface MessageUpsertData {
  key: {
    remoteJid: string;
    fromMe: boolean;
    id: string;
    participant?: string;
  };
  pushName?: string;
  message?: {
    conversation?: string;
    extendedTextMessage?: { text: string };
    imageMessage?: { caption?: string; mimetype?: string; url?: string };
    videoMessage?: { caption?: string; mimetype?: string; url?: string };
    audioMessage?: { mimetype?: string; url?: string };
    documentMessage?: { fileName?: string; mimetype?: string; url?: string };
    stickerMessage?: any;
    locationMessage?: { degreesLatitude: number; degreesLongitude: number };
  };
  messageType?: string;
  messageTimestamp?: number;
  status?: string;
}

export interface ConnectionUpdateData {
  state: 'open' | 'connecting' | 'close';
  statusReason?: number;
}

export interface QrCodeUpdateData {
  qrcode: {
    base64: string;
    code: string;
  };
}
