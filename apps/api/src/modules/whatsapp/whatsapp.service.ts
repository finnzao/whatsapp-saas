import { Injectable, Inject, NotFoundException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  WHATSAPP_PROVIDER,
  WhatsappProvider,
} from './whatsapp-provider.interface';

@Injectable()
export class WhatsappService {
  private readonly logger = new Logger(WhatsappService.name);

  constructor(
    @Inject(WHATSAPP_PROVIDER) private readonly provider: WhatsappProvider,
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Cria nova instância de WhatsApp para um tenant.
   * O instanceName é único globalmente, usamos o tenantId pra garantir.
   */
  async createInstanceForTenant(tenantId: string) {
    const instanceName = `tenant_${tenantId.replace(/-/g, '').slice(0, 16)}`;
    const webhookUrl = `${this.config.get('APP_URL')}/webhooks/evolution`;

    const result = await this.provider.createInstance({
      instanceName,
      webhookUrl,
    });

    const instance = await this.prisma.whatsappInstance.create({
      data: {
        tenantId,
        instanceName,
        apiKey: result.apiKey,
        status: result.status,
        qrCode: result.qrCode,
      },
    });

    this.logger.log(`Instância criada: ${instanceName} para tenant ${tenantId}`);
    return instance;
  }

  async getQrCode(tenantId: string): Promise<string | null> {
    const instance = await this.prisma.whatsappInstance.findFirst({
      where: { tenantId },
    });
    if (!instance) throw new NotFoundException('Instância não encontrada');

    const qr = await this.provider.getQrCode(instance.instanceName);
    if (qr) {
      await this.prisma.whatsappInstance.update({
        where: { id: instance.id },
        data: { qrCode: qr, status: 'QRCODE' },
      });
    }
    return qr;
  }

  async refreshStatus(tenantId: string) {
    const instance = await this.prisma.whatsappInstance.findFirst({
      where: { tenantId },
    });
    if (!instance) throw new NotFoundException('Instância não encontrada');

    const status = await this.provider.getInstanceStatus(instance.instanceName);
    return this.prisma.whatsappInstance.update({
      where: { id: instance.id },
      data: {
        status,
        ...(status === 'CONNECTED' && { lastConnectedAt: new Date() }),
      },
    });
  }

  /**
   * Envia mensagem de texto. Resolve a instância do tenant automaticamente.
   */
  async sendText(tenantId: string, to: string, text: string) {
    const instance = await this.getConnectedInstance(tenantId);
    return this.provider.sendTextMessage({
      instanceName: instance.instanceName,
      to,
      text,
    });
  }

  async sendMedia(
    tenantId: string,
    to: string,
    mediaUrl: string,
    mediaType: 'image' | 'video' | 'audio' | 'document',
    caption?: string,
  ) {
    const instance = await this.getConnectedInstance(tenantId);
    return this.provider.sendMediaMessage({
      instanceName: instance.instanceName,
      to,
      mediaUrl,
      mediaType,
      caption,
    });
  }

  async findInstanceByName(instanceName: string) {
    return this.prisma.whatsappInstance.findUnique({
      where: { instanceName },
    });
  }

  private async getConnectedInstance(tenantId: string) {
    const instance = await this.prisma.whatsappInstance.findFirst({
      where: { tenantId, status: 'CONNECTED' },
    });
    if (!instance) {
      throw new NotFoundException('Nenhuma instância conectada para este tenant');
    }
    return instance;
  }
}
