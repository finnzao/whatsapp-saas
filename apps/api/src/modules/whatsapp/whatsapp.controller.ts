import { Controller, Post, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { WhatsappService } from './whatsapp.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';

@ApiTags('whatsapp')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('whatsapp')
export class WhatsappController {
  constructor(private readonly whatsapp: WhatsappService) {}

  @Post('instance')
  async createInstance(@CurrentTenant() tenantId: string) {
    return this.whatsapp.createInstanceForTenant(tenantId);
  }

  @Get('instance/qr')
  async getQr(@CurrentTenant() tenantId: string) {
    const qr = await this.whatsapp.getQrCode(tenantId);
    return { qrCode: qr };
  }

  @Get('instance/status')
  async getStatus(@CurrentTenant() tenantId: string) {
    return this.whatsapp.refreshStatus(tenantId);
  }
}
