import {
  Controller,
  Post,
  Get,
  Delete,
  Body,
  UseGuards,
  HttpCode,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { DebugService } from './debug.service';
import { SimulateInboundDto } from './dto/simulate-inbound.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';

@ApiTags('debug')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('debug')
export class DebugController {
  constructor(private readonly debug: DebugService) {}

  @Post('simulate-inbound')
  @HttpCode(200)
  simulate(@CurrentTenant() tenantId: string, @Body() dto: SimulateInboundDto) {
    return this.debug.simulateInbound(tenantId, dto.text, dto.contactName);
  }

  @Get('history')
  history(@CurrentTenant() tenantId: string) {
    return this.debug.getHistory(tenantId);
  }

  @Delete('reset')
  @HttpCode(200)
  reset(@CurrentTenant() tenantId: string) {
    return this.debug.resetConversation(tenantId);
  }
}
