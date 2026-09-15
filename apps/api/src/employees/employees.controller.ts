import { Get, Controller, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';

import { Public } from '../rbac/decorators/public.decorator.js';
import { CurrentUser } from '../rbac/decorators/current-user.decorator.js';
import type { JwtAccessPayload } from '../auth/types/jwt-payload.type.js';
import { EmployeeContextGuard } from './employee-context.guard.js';
import { EmployeesService } from './employees.service.js';

/**
 * Employee Module V1 endpoints (Phase 2).
 *
 * Authorization chain for every route here:
 *   1. global JwtAuthGuard  -> authenticates (route-level @Public() does
 *      NOT weaken it; only @PublicAuth() would, and it is not used here);
 *   2. global OrganizationMembershipGuard -> BYPASSED via @Public(),
 *      because employees are not Organization members and must not be
 *      required to send X-Organization-Id (same pattern as
 *      GET /memberships/me);
 *   3. EmployeeContextGuard -> verifies the 1:1 EmployeeProfile row for
 *      req.user.sub (fail-closed 403) and attaches req.employeeProfile.
 *
 * Single approved read endpoint in Phase 2. No mutation routes exist:
 * the EmployeeProfile is created only by the atomic registration
 * transaction and carries no client-writable fields.
 */
@ApiTags('employees')
@ApiBearerAuth()
@Controller('employees')
export class EmployeesController {
  constructor(private readonly employeesService: EmployeesService) {}

  /**
   * The authenticated employee's own profile.
   *
   * Authorization: Bearer <valid-access-token> -> REQUIRED
   * X-Organization-Id                           -> NOT required
   */
  @Get('me/profile')
  @Public()
  @UseGuards(EmployeeContextGuard)
  @ApiOperation({
    summary: "Return the authenticated employee's own profile.",
    description:
      'Requires a valid access token; does NOT require an X-Organization-Id header. Returns the 1:1 EmployeeProfile for the authenticated user joined with non-secret identity fields. 403 when the user has no EmployeeProfile.',
  })
  @ApiOkResponse({
    description:
      "The caller's EmployeeProfile (id, userId, createdAt, updatedAt) with the joined user identity (id, email, fullName).",
  })
  @ApiForbiddenResponse({
    description: 'The authenticated user has no EmployeeProfile (not an employee).',
  })
  @ApiUnauthorizedResponse({
    description: 'Missing or invalid access token.',
  })
  me(@CurrentUser() user: JwtAccessPayload) {
    return this.employeesService.getOwnProfile(user.sub);
  }
}
