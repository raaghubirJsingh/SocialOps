import { Controller, Get } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
  ApiForbiddenResponse,
  ApiBadRequestResponse,
} from '@nestjs/swagger';
import { CurrentUser } from '../rbac/decorators/current-user.decorator.js';
import type { JwtAccessPayload } from '../auth/types/jwt-payload.type.js';
import { PrismaService } from '../prisma/prisma.service.js';

class MembershipOrganizationDto {
  id!: string;
  name!: string;
  slug!: string;
}

class MembershipDto {
  role!: 'OWNER' | 'ADMIN' | 'MEMBER' | 'VIEWER';
  organization!: MembershipOrganizationDto;
}

class MembershipsResponseDto {
  userId!: string;
  memberships!: MembershipDto[];
}

/**
 * Stage B7 memberships test resource.
 *
 * The ONLY new production route in B7. Returns the authenticated user's
 * OWN OrganizationMembership rows (joined with the Organization).
 *
 * Authorization (both guards are registered globally as APP_GUARD in
 * `app.module.ts` so this controller does not need route-level
 * `@UseGuards(...)`):
 *
 *   - `JwtAuthGuard` (global) -> 401 without a valid access token.
 *   - `OrganizationMembershipGuard` (global) -> 400 without
 *     `X-Organization-Id`, 403 if the user is not a member of the
 *     requested organization.
 *   - No minimum-role guard: any authenticated organization member may
 *     read their own memberships.
 *
 * Security:
 *
 *   - The query is constrained by `req.user.sub`. The caller cannot
 *     supply a `userId` parameter to read another user's data.
 *   - The role returned in the response is read from the
 *     OrganizationMembership row, not from the request.
 */
@ApiTags('memberships', 'rbac')
@ApiBearerAuth()
@Controller('memberships')
export class MembershipsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('me')
  @ApiOperation({
    summary:
      "Return the authenticated user's memberships (joined with their organizations).",
    description:
      "Requires a valid access token and an `X-Organization-Id` header. " +
      'Returns the rows from `OrganizationMembership` (and their associated ' +
      '`Organization`) that belong to the authenticated user. The query is ' +
      'constrained by `req.user.sub`; callers cannot request another user ' +
      "'s data.",
  })
  @ApiOkResponse({
    description:
      "The authenticated user's own memberships for the requested organization.",
  })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid access token.' })
  @ApiBadRequestResponse({
    description: 'Missing or malformed `X-Organization-Id` header.',
  })
  @ApiForbiddenResponse({
    description:
      'Authenticated user is not a member of the requested organization.',
  })
  async getMyMemberships(
    @CurrentUser() user: JwtAccessPayload,
  ): Promise<MembershipsResponseDto> {
    const memberships = await this.prisma.organizationMembership.findMany({
      where: { userId: user.sub },
      orderBy: { createdAt: 'asc' },
      select: {
        role: true,
        organization: {
          select: { id: true, name: true, slug: true },
        },
      },
    });

    return {
      userId: user.sub,
      memberships: memberships.map((m) => ({
        role: m.role,
        organization: m.organization,
      })),
    };
  }
}
