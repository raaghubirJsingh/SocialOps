import { Module } from '@nestjs/common';

import { FreelancerContextGuard } from './guards/freelancer-context.guard.js';
import { FreelancerProfileCompleteGuard } from './guards/freelancer-profile-complete.guard.js';
import { FreelancersController } from './freelancers.controller.js';
import { FreelancersService } from './freelancers.service.js';

@Module({
  controllers: [FreelancersController],
  providers: [FreelancerContextGuard, FreelancerProfileCompleteGuard, FreelancersService],
  exports: [FreelancerContextGuard, FreelancerProfileCompleteGuard, FreelancersService],
})
export class FreelancersModule {}
