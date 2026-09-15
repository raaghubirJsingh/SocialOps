import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { Public } from '../rbac/decorators/public.decorator.js';
import { PublicAuth } from '../rbac/decorators/public-auth.decorator.js';
import { HealthService } from './health.service.js';

@ApiTags('app')
@Controller('health')
@Public()
@PublicAuth()
export class HealthController {
  constructor(private readonly health: HealthService) {}

  @Get()
  @ApiOkResponse({
    description:
      'Readiness result for PostgreSQL and Redis. Public endpoint: no JWT and no X-Organization-Id required.',
  })
  async check() {
    return this.health.check();
  }
}
