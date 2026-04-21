import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { AuthenticatedUser } from '../types/auth.types';

/**
 * Extrai o tenantId do usuário autenticado.
 * Uso: @CurrentTenant() tenantId: string
 */
export const CurrentTenant = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string => {
    const req = ctx.switchToHttp().getRequest();
    const user = req.user as AuthenticatedUser;
    if (!user?.tenantId) {
      throw new Error('TenantId não encontrado — rota está protegida por JwtAuthGuard?');
    }
    return user.tenantId;
  },
);

/**
 * Extrai o usuário autenticado completo.
 * Uso: @CurrentUser() user: AuthenticatedUser
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthenticatedUser => {
    const req = ctx.switchToHttp().getRequest();
    return req.user as AuthenticatedUser;
  },
);
