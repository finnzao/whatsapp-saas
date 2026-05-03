import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';
import {
  WhatsappProvider,
  CreateInstanceParams,
  CreateInstanceResult,
  InstanceStatus,
  SendTextParams,
  SendMediaParams,
  SendMessageResult,
  SendPresenceParams,
} from '../whatsapp-provider.interface';

@Injectable()
export class EvolutionProvider implements WhatsappProvider {
  private readonly logger = new Logger(EvolutionProvider.name);
  private readonly http: AxiosInstance;
  private readonly globalApiKey: string;

  constructor(private readonly config: ConfigService) {
    const baseURL = this.config.get<string>('EVOLUTION_API_URL', 'http://localhost:8080');
    this.globalApiKey = this.config.get<string>('EVOLUTION_API_KEY', '');

    this.http = axios.create({
      baseURL,
      timeout: 30_000,
      headers: {
        'Content-Type': 'application/json',
        apikey: this.globalApiKey,
      },
    });

    this.http.interceptors.response.use(
      (r) => r,
      (error) => {
        this.logger.error(
          `Evolution API error: ${error.response?.status} ${JSON.stringify(error.response?.data)}`,
        );
        return Promise.reject(error);
      },
    );
  }

  async createInstance(params: CreateInstanceParams): Promise<CreateInstanceResult> {
    try {
      const { data } = await this.http.post('/instance/create', {
        instanceName: params.instanceName,
        qrcode: true,
        integration: 'WHATSAPP-BAILEYS',
        webhookUrl: params.webhookUrl,
        webhookByEvents: false,
        webhookEvents: [
          'MESSAGES_UPSERT',
          'MESSAGES_UPDATE',
          'CONNECTION_UPDATE',
          'QRCODE_UPDATED',
        ],
      });

      return {
        instanceName: params.instanceName,
        apiKey: data.hash?.apikey ?? data.apikey ?? '',
        qrCode: data.qrcode?.base64,
        status: this.mapStatus(data.instance?.status),
      };
    } catch (error: any) {
      throw new HttpException(
        `Falha ao criar instância: ${error.response?.data?.message ?? error.message}`,
        HttpStatus.BAD_GATEWAY,
      );
    }
  }

  async deleteInstance(instanceName: string): Promise<void> {
    await this.http.delete(`/instance/delete/${instanceName}`);
  }

  async getInstanceStatus(instanceName: string): Promise<InstanceStatus> {
    try {
      const { data } = await this.http.get(`/instance/connectionState/${instanceName}`);
      return this.mapStatus(data.instance?.state);
    } catch {
      return 'ERROR';
    }
  }

  async getQrCode(instanceName: string): Promise<string | null> {
    try {
      const { data } = await this.http.get(`/instance/connect/${instanceName}`);
      return data.base64 ?? data.qrcode?.base64 ?? null;
    } catch {
      return null;
    }
  }

  async sendTextMessage(params: SendTextParams): Promise<SendMessageResult> {
    const { data } = await this.http.post(`/message/sendText/${params.instanceName}`, {
      number: this.formatPhone(params.to),
      text: params.text,
      ...(params.quotedMessageId && { quoted: { key: { id: params.quotedMessageId } } }),
    });

    return {
      externalId: data.key?.id ?? '',
      status: data.status === 'PENDING' ? 'PENDING' : 'SENT',
    };
  }

  async sendMediaMessage(params: SendMediaParams): Promise<SendMessageResult> {
    const { data } = await this.http.post(`/message/sendMedia/${params.instanceName}`, {
      number: this.formatPhone(params.to),
      mediatype: params.mediaType,
      media: params.mediaUrl,
      caption: params.caption,
      fileName: params.fileName,
    });

    return {
      externalId: data.key?.id ?? '',
      status: 'SENT',
    };
  }

  async sendPresence(params: SendPresenceParams): Promise<void> {
    try {
      await this.http.post(`/chat/sendPresence/${params.instanceName}`, {
        number: this.formatPhone(params.to),
        presence: params.presence,
        delay: params.delayMs ?? 1200,
      });
    } catch (error: any) {
      this.logger.debug(
        `[evolution] sendPresence falhou (best-effort, ignorando): ${error.response?.status ?? error.code} ${error.message}`,
      );
    }
  }

  async setWebhook(instanceName: string, url: string, events: string[]): Promise<void> {
    await this.http.post(`/webhook/set/${instanceName}`, {
      enabled: true,
      url,
      webhookByEvents: false,
      events,
    });
  }

  private mapStatus(status?: string): InstanceStatus {
    switch (status) {
      case 'open':
        return 'CONNECTED';
      case 'connecting':
        return 'CONNECTING';
      case 'close':
        return 'DISCONNECTED';
      default:
        return 'DISCONNECTED';
    }
  }

  private formatPhone(phone: string): string {
    return phone.replace(/\D/g, '');
  }
}
