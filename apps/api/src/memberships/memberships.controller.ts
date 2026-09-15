import { Controller, Get } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentUser } from '../rbac/decorators/current-user.decorator.js';
import { Public } from '../rbac/decorators/public.decorator.js';
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
 * Stage B7 memberships resource.
 *
 * Returns the authenticated user's OWN OrganizationMembership rows
 * (joined with the Organization). This is the "list my orgs" endpoint
 * the frontend uses to populate the active-organization switcher; it
 * is therefore the entry point through which a verified user discovers
 * which organizations they are a member of.
 *
 * Authorization:
 *
 *   - `JwtAuthGuard` (global) -> 401 without a valid access token.
 *     The route does NOT use `@PublicAuth()`, so JWT verification
 *     remains mandatory.
 *   - `OrganizationMembershipGuard` (global) is bypassed for this
 *     route via `@Public()`. The endpoint returns ALL of the caller's
 *     own memberships across every organization they belong to, so
 *     requiring a single `X-Organization-Id` would be a chicken-and-egg
 *     problem (the user must first see this list to pick one). The
 *     `X-Organization-Id` header is therefore NOT required here.
 *   - No minimum-role guard: any authenticated user may read their own
 *     memberships.
 *
 * Security:
 *
 *   - The query is constrained by `req.user.sub`. The caller cannot
 *     supply a `userId` parameter to read another user's data.
 *   - The roles returned in the response are read from each
 *     OrganizationMembership row, not from the request.
 *   - Organization scoping for tenant-scoped resources is still
 *     enforced by the global `OrganizationMembershipGuard`. This route
 *     only REPORTS which organizations the caller is a member of; it
 *     does not grant or modify any authorization state.
 */
@ApiTags('memberships', 'rbac')
@ApiBearerAuth()
@Controller('memberships')
export class MembershipsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('me')
  @Public()
  @ApiOperation({
    summary:
      "Return the authenticated user's memberships (joined with their organizations).",
    description:
      "Requires a valid access token. Does NOT require an `X-Organization-Id` " +
      'header. Returns the rows from `OrganizationMembership` (and their ' +
      'associated `Organization`) that belong to the authenticated user, ' +
      'so the caller can pick which organization to act under. The query is ' +
      'constrained by `req.user.sub`; callers cannot request another user ' +
      "'s data.",
  })
  @ApiOkResponse({
    description:
      "The authenticated user's own memberships, across every organization they belong to.",
  })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid access token.' })
  async getMyMemberships(
    @CurrentUser() user: JwtAccessPayload,
  ): Promise<MembershipsResponseDto> {
    const memberships = await this.prisma.organizationMembership.findMany({
      where: { userId: user.sub },
      orderBy: { createdAt: 'asc' },
      select: {
        role: true,
        organization: {
          select: { id: true, name: true, slug: true, isActive: true },
        },
      },
    });

    const activeMemberships = memberships.filter(
      (m) => m.organization.isActive === true,
    );

    return {
      userId: user.sub,
      memberships: activeMemberships.map((m) => ({
        role: m.role,
        organization: m.organization,
      })),
    };
  }
}
