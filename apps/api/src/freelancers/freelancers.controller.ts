import { Body, Controller, Get, HttpCode, HttpStatus, Patch, Post, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';

import type { JwtAccessPayload } from '../auth/types/jwt-payload.type.js';
import { CurrentUser } from '../rbac/decorators/current-user.decorator.js';
import { Public } from '../rbac/decorators/public.decorator.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { FreelancerContextGuard } from './guards/freelancer-context.guard.js';
import { FreelancersService } from './freelancers.service.js';
import {
  updateFreelancerProfileSchema,
  type UpdateFreelancerProfileDto,
  type FreelancerProfileResponse,
} from './dto/freelancer-profile.dto.js';

@ApiTags('freelancers')
@ApiBearerAuth()
@Controller('freelancers')
export class FreelancersController {
  constructor(private readonly freelancersService: FreelancersService) {}
  @Post('me/profile')
  @Public()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: "Create the authenticated user's FreelancerProfile if missing." })
  @ApiCreatedResponse({ description: "The caller's FreelancerProfile." })
  @ApiForbiddenResponse({ description: 'Client accounts cannot create a FreelancerProfile.' })
  @ApiConflictResponse({ description: 'FreelancerProfile already exists.' })
  async createProfile(
    @CurrentUser() user: JwtAccessPayload,
  ): Promise<FreelancerProfileResponse> {
    return this.freelancersService.ensureOwnProfile(user.sub);
  }


  @Get('me/profile')
  @Public()
  @UseGuards(FreelancerContextGuard)
  @ApiOperation({ summary: "Return the authenticated freelancer's own profile." })
  @ApiOkResponse({ description: "The caller's FreelancerProfile." })
  @ApiForbiddenResponse({ description: 'The authenticated user has no FreelancerProfile.' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid access token.' })
  me(@CurrentUser() user: JwtAccessPayload): Promise<FreelancerProfileResponse> {
    return this.freelancersService.getOwnProfile(user.sub);
  }

  @Patch('me/profile')
  @Public()
  @UseGuards(FreelancerContextGuard)
  @ApiOperation({ summary: "Update the authenticated freelancer's own profile." })
  @ApiOkResponse({ description: 'The updated FreelancerProfile.' })
  @ApiForbiddenResponse({ description: 'The authenticated user has no FreelancerProfile.' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid access token.' })
  update(
    @CurrentUser() user: JwtAccessPayload,
    @Body(new ZodValidationPipe(updateFreelancerProfileSchema))
    dto: UpdateFreelancerProfileDto,
  ): Promise<FreelancerProfileResponse> {
    return this.freelancersService.updateOwnProfile(user.sub, dto);
  }

  @Post('me/profile/submit')
  @Public()
  @HttpCode(HttpStatus.OK)
  @UseGuards(FreelancerContextGuard)
  @ApiOperation({ summary: 'Submit the authenticated freelancer profile for review.' })
  @ApiOkResponse({ description: 'The submitted FreelancerProfile.' })
  @ApiForbiddenResponse({ description: 'The authenticated user has no FreelancerProfile.' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid access token.' })
  submit(
    @CurrentUser() user: JwtAccessPayload,
  ): Promise<FreelancerProfileResponse> {
    return this.freelancersService.submitOwnProfile(user.sub);
  }
}
