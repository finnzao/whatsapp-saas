import { Controller, Get } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';

@ApiExcludeController()
@Controller('health')
export class HealthController {
  @Get()
  check() {
    return { ok: true, ts: Date.now() };
  }
}
