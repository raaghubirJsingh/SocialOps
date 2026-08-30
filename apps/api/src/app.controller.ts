import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

import { AppService } from './app.service.js';
import { Public } from './rbac/decorators/public.decorator.js';
import { PublicAuth } from './rbac/decorators/public-auth.decorator.js';

@ApiTags('app')
@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  /**
   * Health endpoint.
   *
   * This endpoint requires neither:
   *
   * - JWT authentication
   * - Organization context
   *
   * @Public()      -> bypasses OrganizationMembershipGuard
   * @PublicAuth()  -> bypasses JwtAuthGuard
   */
  @Get('health')
  @Public()
  @PublicAuth()
  @ApiOperation({
    summary: 'Health check',
    description:
      'Returns API health status without requiring authentication or organization context.',
  })
  @ApiResponse({
    status: 200,
    description: 'API is healthy.',
  })
  health() {
    return this.appService.getHealth();
  }
}