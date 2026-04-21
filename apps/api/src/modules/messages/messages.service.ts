import { Injectable, NotFoundException } from '@nestjs/common';
import { IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

import { PrismaService } from '../../common/prisma/prisma.service';
import { WhatsappService } from '../whatsapp/whatsapp.service';

export class SendMessageDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  text!: string;
}

@Injectable()
export class MessagesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly whatsapp: WhatsappService,
  ) {}

  /**
   * Envia mensagem manual em uma conversa (lojista atendendo)
   */
  async sendFromConversation(tenantId: string, conversationId: string, text: string) {
    const conversation = await this.prisma.conversation.findFirst({
      where: { id: conversationId, tenantId },
      include: { contact: true },
    });
    if (!conversation) throw new NotFoundException('Conversa não encontrada');

    const result = await this.whatsapp.sendText(tenantId, conversation.contact.phone, text);

    return this.prisma.message.create({
      data: {
        tenantId,
        conversationId,
        contactId: conversation.contactId,
        externalId: result.externalId,
        direction: 'OUTBOUND',
        type: 'TEXT',
        content: text,
        status: result.status === 'FAILED' ? 'FAILED' : 'SENT',
        fromBot: false,
      },
    });
  }
}
