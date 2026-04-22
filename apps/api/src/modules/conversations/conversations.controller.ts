import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Query,
  UseGuards,
  HttpCode,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { $Enums } from '@prisma/client';

import { ConversationsService } from './conversations.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import {
  CurrentTenant,
  CurrentUser,
} from '../../common/decorators/current-tenant.decorator';
import { AuthenticatedUser } from '../../common/types/auth.types';

@ApiTags('conversations')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('conversations')
export class ConversationsController {
  constructor(private readonly service: ConversationsService) {}

  @Get()
  list(
    @CurrentTenant() tenantId: string,
    @Query('status') status?: $Enums.ConversationStatus,
    @Query('page') page?: number,
    @Query('pageSize') pageSize?: number,
  ) {
    return this.service.list(tenantId, { status, page: Number(page), pageSize: Number(pageSize) });
  }

  @Get(':id')
  findOne(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    return this.service.findOne(tenantId, id);
  }

  @Get(':id/messages')
  getMessages(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
    @Query('page') page?: number,
    @Query('pageSize') pageSize?: number,
  ) {
    return this.service.getMessages(tenantId, id, Number(page) || 1, Number(pageSize) || 50);
  }

  @Post(':id/take-over')
  @HttpCode(200)
  takeOver(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.takeOver(tenantId, id, user.id);
  }

  @Post(':id/release')
  @HttpCode(200)
  release(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    return this.service.releaseToBot(tenantId, id);
  }

  @Patch(':id/resolve')
  resolve(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    return this.service.resolve(tenantId, id);
  }

  @Patch(':id/read')
  markAsRead(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    return this.service.markAsRead(tenantId, id);
  }
}
