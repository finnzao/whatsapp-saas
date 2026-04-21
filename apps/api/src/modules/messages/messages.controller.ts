import { Controller, Post, Body, Param, UseGuards, HttpCode } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { MessagesService, SendMessageDto } from './messages.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';

@ApiTags('messages')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('conversations/:id/messages')
export class MessagesController {
  constructor(private readonly service: MessagesService) {}

  @Post()
  @HttpCode(201)
  send(
    @CurrentTenant() tenantId: string,
    @Param('id') conversationId: string,
    @Body() dto: SendMessageDto,
  ) {
    return this.service.sendFromConversation(tenantId, conversationId, dto.text);
  }
}
