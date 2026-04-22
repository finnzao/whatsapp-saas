import {
  Controller,
  Get,
  Patch,
  Param,
  Body,
  Query,
  Injectable,
  Module,
  UseGuards,
  NotFoundException,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
import { $Enums } from '@prisma/client';

import { PrismaService } from '../../common/prisma/prisma.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';

const OrderStatusValues = [
  'PENDING',
  'CONFIRMED',
  'PREPARING',
  'SHIPPED',
  'DELIVERED',
  'CANCELLED',
] as const;

const PaymentStatusValues = ['PENDING', 'PAID', 'REFUNDED', 'FAILED'] as const;

export class UpdateOrderStatusDto {
  @IsOptional()
  @IsEnum(OrderStatusValues)
  status?: $Enums.OrderStatus;

  @IsOptional()
  @IsEnum(PaymentStatusValues)
  paymentStatus?: $Enums.PaymentStatus;
}

@Injectable()
export class OrdersService {
  constructor(private readonly prisma: PrismaService) {}

  list(tenantId: string, status?: $Enums.OrderStatus) {
    return this.prisma.order.findMany({
      where: { tenantId, ...(status && { status }) },
      include: {
        contact: { select: { id: true, name: true, phone: true, pushName: true } },
        items: { include: { product: { select: { id: true, name: true } } } },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  async findOne(tenantId: string, id: string) {
    const order = await this.prisma.order.findFirst({
      where: { id, tenantId },
      include: {
        contact: true,
        items: { include: { product: true } },
        conversation: { select: { id: true } },
      },
    });
    if (!order) throw new NotFoundException('Pedido não encontrado');
    return order;
  }

  async updateStatus(tenantId: string, id: string, dto: UpdateOrderStatusDto) {
    await this.findOne(tenantId, id);
    return this.prisma.order.update({ where: { id }, data: dto });
  }
}

@ApiTags('orders')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('orders')
export class OrdersController {
  constructor(private readonly service: OrdersService) {}

  @Get()
  list(@CurrentTenant() tenantId: string, @Query('status') status?: $Enums.OrderStatus) {
    return this.service.list(tenantId, status);
  }

  @Get(':id')
  findOne(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    return this.service.findOne(tenantId, id);
  }

  @Patch(':id/status')
  updateStatus(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
    @Body() dto: UpdateOrderStatusDto,
  ) {
    return this.service.updateStatus(tenantId, id, dto);
  }
}

@Module({
  providers: [OrdersService],
  controllers: [OrdersController],
})
export class OrdersModule {}
