import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

import { AppService } from './app.service.js';
import { Public } from './rbac/decorators/public.decorator.js';
import { PublicAuth } from './rbac/decorators/public-auth.decorator.js';

@ApiTags('app')
@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

}