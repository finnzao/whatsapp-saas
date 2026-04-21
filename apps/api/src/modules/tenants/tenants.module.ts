import {
  Controller,
  Get,
  Patch,
  Body,
  Injectable,
  Module,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

import { PrismaService } from '../../common/prisma/prisma.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';

export class UpdateTenantDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() segment?: string;
}

@Injectable()
export class TenantsService {
  constructor(private readonly prisma: PrismaService) {}

  getCurrent(tenantId: string) {
    return this.prisma.tenant.findUnique({
      where: { id: tenantId },
      include: { settings: true, _count: { select: { users: true, products: true } } },
    });
  }

  update(tenantId: string, dto: UpdateTenantDto) {
    return this.prisma.tenant.update({ where: { id: tenantId }, data: dto });
  }
}

@ApiTags('tenants')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('tenant')
export class TenantsController {
  constructor(private readonly service: TenantsService) {}

  @Get('me')
  me(@CurrentTenant() tenantId: string) {
    return this.service.getCurrent(tenantId);
  }

  @Patch('me')
  update(@CurrentTenant() tenantId: string, @Body() dto: UpdateTenantDto) {
    return this.service.update(tenantId, dto);
  }
}

@Module({
  providers: [TenantsService],
  controllers: [TenantsController],
})
export class TenantsModule {}
