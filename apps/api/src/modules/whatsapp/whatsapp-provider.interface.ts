/**
 * Abstração do provider de WhatsApp.
 * Permite trocar entre Evolution API (não-oficial) e Cloud API (oficial)
 * sem mexer na lógica de negócio.
 */

export interface WhatsappProvider {
  createInstance(params: CreateInstanceParams): Promise<CreateInstanceResult>;
  deleteInstance(instanceName: string): Promise<void>;
  getInstanceStatus(instanceName: string): Promise<InstanceStatus>;
  getQrCode(instanceName: string): Promise<string | null>;

  sendTextMessage(params: SendTextParams): Promise<SendMessageResult>;
  sendMediaMessage(params: SendMediaParams): Promise<SendMessageResult>;

  setWebhook(instanceName: string, url: string, events: string[]): Promise<void>;
}

export interface CreateInstanceParams {
  instanceName: string;
  webhookUrl?: string;
}

export interface CreateInstanceResult {
  instanceName: string;
  apiKey: string;
  qrCode?: string;
  status: InstanceStatus;
}

export type InstanceStatus = 'DISCONNECTED' | 'CONNECTING' | 'CONNECTED' | 'QRCODE' | 'ERROR';

export interface SendTextParams {
  instanceName: string;
  to: string;
  text: string;
  quotedMessageId?: string;
}

export interface SendMediaParams {
  instanceName: string;
  to: string;
  mediaUrl: string;
  mediaType: 'image' | 'video' | 'audio' | 'document';
  caption?: string;
  fileName?: string;
}

export interface SendMessageResult {
  externalId: string;
  status: 'SENT' | 'PENDING' | 'FAILED';
}

export const WHATSAPP_PROVIDER = Symbol('WHATSAPP_PROVIDER');
