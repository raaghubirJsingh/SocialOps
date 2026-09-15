import { Module } from '@nestjs/common';

import { EmployeeContextGuard } from './employee-context.guard.js';
import { EmployeesController } from './employees.controller.js';
import { EmployeesService } from './employees.service.js';

/**
 * Employee Module V1 (Phase 2).
 *
 * Hosts the single approved production route
 * (`GET /api/employees/me/profile`) and the EmployeeContextGuard.
 *
 * PrismaModule is global (registered in AppModule) and does not need to
 * be imported here. The module intentionally registers no global guards:
 * JwtAuthGuard and OrganizationMembershipGuard are already global
 * APP_GUARDs, and EmployeeContextGuard is applied per route.
 */
@Module({
  controllers: [EmployeesController],
  providers: [EmployeeContextGuard, EmployeesService],
  exports: [EmployeeContextGuard, EmployeesService],
})
export class EmployeesModule {}
