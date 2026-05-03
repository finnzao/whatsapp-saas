import {
  Controller,
  Post,
  Get,
  Delete,
  Body,
  Query,
  UseGuards,
  HttpCode,
  Sse,
  MessageEvent,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtService } from '@nestjs/jwt';
import { Observable, map } from 'rxjs';

import { DebugService } from './debug.service';
import { SimulateInboundDto } from './dto/simulate-inbound.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { JwtPayload } from '../../common/types/auth.types';

@ApiTags('debug')
@Controller('debug')
export class DebugController {
  constructor(
    private readonly debug: DebugService,
    private readonly jwt: JwtService,
  ) {}

  @Sse('stream')
  stream(@Query('token') token?: string): Observable<MessageEvent> {
    const tenantId = this.resolveTenantFromToken(token);
    return this.debug.streamFor(tenantId).pipe(
      map((event) => ({ data: event } as MessageEvent)),
    );
  }

  @Post('simulate-inbound')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @HttpCode(202)
  simulate(@CurrentTenant() tenantId: string, @Body() dto: SimulateInboundDto) {
    return this.debug.simulateInbound(tenantId, dto.text, dto.contactName);
  }

  @Get('history')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  history(@CurrentTenant() tenantId: string) {
    return this.debug.getHistory(tenantId);
  }

  @Delete('reset')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @HttpCode(200)
  reset(@CurrentTenant() tenantId: string) {
    return this.debug.resetConversation(tenantId);
  }

  private resolveTenantFromToken(token: string | undefined): string {
    if (!token) {
      throw new UnauthorizedException('Token ausente para conexão SSE');
    }
    try {
      const payload = this.jwt.verify<JwtPayload>(token);
      if (!payload?.tenantId) {
        throw new UnauthorizedException('Token sem tenantId');
      }
      return payload.tenantId;
    } catch {
      throw new UnauthorizedException('Token inválido para SSE');
    }
  }
}
