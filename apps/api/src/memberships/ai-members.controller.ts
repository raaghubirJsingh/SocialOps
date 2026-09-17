import { Controller, Get } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';

import { PrismaService } from '../prisma/prisma.service.js';
import {
  CurrentOrganization,
  type RequestOrganizationContext,
} from '../rbac/decorators/current-organization.decorator.js';

class AiEmployeeDto {
  id!: string;
  name!: string;
  skillSpecialization!: string | null;
}

/**
 * AI Employee Fleet listing (Unified Content & AI Foundation).
 *
 * Returns the AI employees (Users with `isBot = true`) that hold a membership
 * in the CALLER'S ACTIVE Organization. This is the data source for the Agency
 * workspace's Smart Assignment dropdown.
 *
 * Authorization:
 *   - `JwtAuthGuard` (global) -> 401 without a valid access token.
 *   - `OrganizationMembershipGuard` (global) -> 403 without a verified
 *     `X-Organization-Id` membership. `@CurrentOrganization()` therefore
 *     always yields the server-verified tenant, never a client-supplied id
 *     (AGENTS.md §6-§7: client-supplied tenant context is never authoritative).
 *   - No additional RoleGuard: any authenticated member may list the AI bots
 *     in their own organization. `isBot` carries no authorization weight - the
 *     dispatch mutation re-verifies the MEMBER membership server-side.
 */
@ApiTags('memberships', 'rbac')
@ApiBearerAuth()
@Controller('organizations')
export class AiMembersController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('ai-members')
  @ApiOperation({
    summary:
      "List the AI employees (isBot = true) in the caller's organization.",
    description:
      "Requires a valid access token and a verified `X-Organization-Id` " +
      'membership. Returns the Users with `isBot = true` that are members of ' +
      "the authenticated user's ACTIVE organization, including each bot's " +
      '`skillSpecialization`.',
  })
  @ApiOkResponse({ description: 'The AI employee fleet for the organization.' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid access token.' })
  @ApiForbiddenResponse({ description: 'No verified organization membership.' })
  async list(
    @CurrentOrganization() organization: RequestOrganizationContext,
  ): Promise<AiEmployeeDto[]> {
    const memberships = await this.prisma.organizationMembership.findMany({
      where: {
        organizationId: organization.id,
        user: { isBot: true },
      },
      orderBy: { createdAt: 'asc' },
      select: {
        user: {
          select: {
            id: true,
            fullName: true,
            displayName: true,
            email: true,
            skillSpecialization: true,
          },
        },
      },
    });

    return memberships.map((m) => ({
      id: m.user.id,
      name: m.user.fullName ?? m.user.displayName ?? m.user.email,
      skillSpecialization: m.user.skillSpecialization,
    }));
  }
}
