import {
  BadRequestException,
  Controller,
  Get,
  Param,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { Client } from '@prisma/client';

import { CurrentClient } from '../../clients/decorators/current-client.decorator.js';
import { ClientAccessGuard } from '../../clients/guards/client-access.guard.js';
import type { JwtAccessPayload } from '../../auth/types/jwt-payload.type.js';
import {
  CurrentOrganization,
  type RequestOrganizationContext,
} from '../../rbac/decorators/current-organization.decorator.js';
import { CurrentUser } from '../../rbac/decorators/current-user.decorator.js';
import { RequireMinimumRole } from '../../rbac/decorators/require-roles.decorator.js';
import { RoleGuard } from '../../rbac/guards/role.guard.js';
import { Public } from '../../rbac/decorators/public.decorator.js';
import {
  SOCIAL_PLATFORMS,
  isSocialPlatform,
} from '../../social-accounts/constants/social-platforms.js';
import { SocialAccountsOAuthService } from './social-accounts-oauth.service.js';

/**
 * Resolve + validate the `:platform` path parameter (V1 platforms only).
 * A uniform 400 keeps unsupported platforms from even reaching a provider.
 */
export function requirePlatformParam(raw: string) {
  if (!isSocialPlatform(raw)) {
    throw new BadRequestException(
      `Unsupported platform. V1 platforms: ${SOCIAL_PLATFORMS.join(', ')}`,
    );
  }
  return raw;
}

/**
 * Agency-side OAuth connect start (Decision 013).
 *
 * Authorization chain matches the metadata controller: global JwtAuthGuard +
 * OrganizationMembershipGuard, RoleGuard + @RequireMinimumRole('ADMIN'),
 * and the ACTIVE ClientAgencyRelationship proven inside the service (uniform
 * 404 otherwise). Returns an authorize URL; the browser leaves for the
 * platform - NO token ever transits this API.
 */
@ApiTags('social-accounts')
@ApiBearerAuth()
@Controller('clients/:clientId/social-accounts')
export class SocialAccountOAuthConnectAgencyController {
  constructor(private readonly oauth: SocialAccountsOAuthService) {}

  @Get(':platform/connect')
  @UseGuards(RoleGuard)
  @RequireMinimumRole('ADMIN')
  @ApiOperation({
    summary:
      'Start an OAuth connect for a Client social account (returns authorize URL).',
    description:
      'Mints a signed, single-use CSRF state bound to the authenticated user, the verified organization and the in-scope client. The browser follows authorizeUrl; completion lands on the public callback route. Platform credentials never pass through this API.',
  })
  @ApiOkResponse({
    description: '{ authorizeUrl, expiresIn } - redirect the browser.',
  })
  connectAgency(
    @CurrentUser() user: JwtAccessPayload,
    @CurrentOrganization() organization: RequestOrganizationContext,
    @Param('clientId') clientId: string,
    @Param('platform') rawPlatform: string,
  ) {
    const platform = requirePlatformParam(rawPlatform);
    return this.oauth.startConnectAgency(
      user,
      organization.id,
      clientId,
      platform,
    );
  }
}

/**
 * Client-side OAuth connect start (client-side parity, Decision 013).
 *
 * `@Public()` bypasses ONLY the organization requirement (a client owner is
 * not an Organization member); the global JwtAuthGuard still applies and
 * ClientAccessGuard re-verifies the `X-Client-Id` binding on every request.
 * The tenant organization is resolved server-side from the ACTIVE
 * ClientAgencyRelationship (403 when unmanaged).
 */
@ApiTags('social-accounts')
@ApiBearerAuth()
@Controller('client/me/social-accounts')
export class SocialAccountOAuthConnectMeController {
  constructor(private readonly oauth: SocialAccountsOAuthService) {}

  @Get(':platform/connect')
  @Public()
  @UseGuards(ClientAccessGuard)
  @ApiOperation({
    summary:
      'Start an OAuth connect for one of my own social accounts (returns authorize URL).',
  })
  @ApiOkResponse({
    description: '{ authorizeUrl, expiresIn } - redirect the browser.',
  })
  connectMe(
    @CurrentClient() client: Client,
    @Param('platform') rawPlatform: string,
  ) {
    const platform = requirePlatformParam(rawPlatform);
    return this.oauth.startConnectClient(client.id, platform);
  }
}