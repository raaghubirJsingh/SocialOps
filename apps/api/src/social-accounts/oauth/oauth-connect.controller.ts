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
import type { Client, SocialPlatform } from '@prisma/client';

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
 * ONE connect route, two targets.
 *
 * `GET .../social-accounts/{platform}/connect` and
 * `GET .../social-accounts/{socialAccountId}/connect` have the IDENTICAL
 * Express shape, so they CANNOT be two separate decorated routes: the first
 * registered always wins and would answer every request with "Unsupported
 * platform" (a real 400 observed in integration before this was fixed).
 *
 * The segment is therefore resolved by CONTENT, not by route order:
 *   - a V1 platform name  -> the original platform-scoped flow, byte-for-byte
 *     unchanged (backward compatible);
 *   - anything else       -> the row-scoped flow, which takes the platform FROM
 *     the row, so a caller cannot aim an Instagram row at Facebook.
 *
 * A segment that is neither a V1 platform nor a UUID is a uniform 400: an
 * unsupported platform and a malformed row id are both invalid targets, and the
 * message never reveals which rows exist.
 */
export function resolveConnectTarget(segment: string):
  | { kind: 'platform'; platform: SocialPlatform }
  | { kind: 'account'; socialAccountId: string } {
  if (isSocialPlatform(segment)) {
    return { kind: 'platform', platform: segment };
  }
  if (!isUuid(segment)) {
    throw new BadRequestException(
      `Unsupported platform. V1 platforms: ${SOCIAL_PLATFORMS.join(', ')}`,
    );
  }
  return { kind: 'account', socialAccountId: segment };
}

/** RFC 4122 shape check (any version) - mirrors ParseUUIDPipe's acceptance. */
function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    value,
  );
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

  @Get(':platformOrAccountId/connect')
  @UseGuards(RoleGuard)
  @RequireMinimumRole('ADMIN')
  @ApiOperation({
    summary:
      'Start an OAuth connect for a Client social account (returns authorize URL).',
    description:
      'Mints a signed, single-use CSRF state bound to the authenticated user, the verified organization and the in-scope client. The browser follows authorizeUrl; completion lands on the public callback route. Platform credentials never pass through this API. Pass a V1 platform name for the platform-scoped flow, or an existing SocialAccount id to connect that specific row in place (the platform is then read from the row, and the callback updates that row instead of creating a second one).',
  })
  @ApiOkResponse({
    description: '{ authorizeUrl, expiresIn } - redirect the browser.',
  })
  connectAgency(
    @CurrentUser() user: JwtAccessPayload,
    @CurrentOrganization() organization: RequestOrganizationContext,
    @Param('clientId') clientId: string,
    @Param('platformOrAccountId') segment: string,
  ) {
    const target = resolveConnectTarget(segment);
    // ROW-SCOPED: the row proves its own platform and membership, so there is no
    // platform parameter to tamper with. A state minted here carries the row id,
    // so the callback UPDATES that row instead of upserting a duplicate.
    if (target.kind === 'account') {
      return this.oauth.startConnectAgencyForAccount(
        user,
        organization.id,
        clientId,
        target.socialAccountId,
      );
    }
    return this.oauth.startConnectAgency(
      user,
      organization.id,
      clientId,
      target.platform,
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

  /**
 * ONE connect route, two targets - see `resolveConnectTarget` above for why
 * the platform and row-scoped variants cannot be two separate decorated routes.
 */
@Get(':platformOrAccountId/connect')
  @Public()
  @UseGuards(ClientAccessGuard)
  @ApiOperation({
    summary:
      'Start an OAuth connect for one of my own social accounts (returns authorize URL).',
    description:
      'Pass a V1 platform name for the platform-scoped flow, or one of your existing SocialAccount ids to connect that row in place; the platform is then read from the row and a successful callback updates that row instead of creating a second one.',
  })
  @ApiOkResponse({
    description: '{ authorizeUrl, expiresIn } - redirect the browser.',
  })
  connectMe(
    @CurrentClient() client: Client,
    @Param('platformOrAccountId') segment: string,
  ) {
    const target = resolveConnectTarget(segment);
    if (target.kind === 'account') {
      return this.oauth.startConnectClientForAccount(
        client.id,
        target.socialAccountId,
      );
    }
    return this.oauth.startConnectClient(client.id, target.platform);
  }
}