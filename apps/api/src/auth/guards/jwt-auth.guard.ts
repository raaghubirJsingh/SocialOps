import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
import { IS_JWT_PUBLIC_KEY } from '../../rbac/rbac.constants.js';
import type { JwtAccessPayload } from '../types/jwt-payload.type.js';

/**
 * Stage B7 global JWT authentication guard.
 *
 * Responsibilities:
 *
 *   1. Skip JWT authentication only for routes marked @PublicAuth().
 *   2. Require Authorization: Bearer <token> on protected routes.
 *   3. Verify the access token using JWT_ACCESS_SECRET.
 *   4. Attach the verified JWT payload to req.user.
 *
 * IMPORTANT:
 *
 * This guard intentionally does NOT use IS_PUBLIC_KEY.
 *
 * @Public() controls organization-context enforcement.
 *
 * @PublicAuth() controls JWT authentication.
 *
 * These are intentionally separate concerns.
 *
 * Therefore:
 *
 *   @Public()
 *   logout()
 *
 * means:
 *
 *   JWT authentication       -> REQUIRED
 *   Organization context     -> NOT REQUIRED
 *
 * Whereas:
 *
 *   @Public()
 *   @PublicAuth()
 *   login()
 *
 * means:
 *
 *   JWT authentication       -> NOT REQUIRED
 *   Organization context     -> NOT REQUIRED
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly reflector: Reflector,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    /**
     * Only @PublicAuth() bypasses JWT authentication.
     *
     * DO NOT check IS_PUBLIC_KEY here.
     */
    const isJwtPublic = this.reflector.getAllAndOverride<boolean>(
      IS_JWT_PUBLIC_KEY,
      [
        context.getHandler(),
        context.getClass(),
      ],
    );

    if (isJwtPublic) {
      return true;
    }

    const request = context
      .switchToHttp()
      .getRequest<Request>();

    const authHeader = request.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException(
        'Missing or malformed Authorization header',
      );
    }

    const token = authHeader.slice(7);

    if (!token) {
      throw new UnauthorizedException(
        'Missing or malformed Authorization header',
      );
    }

    try {
      const payload =
        this.jwtService.verify<JwtAccessPayload>(
          token,
          {
            secret: process.env.JWT_ACCESS_SECRET,
          },
        );

      /**
       * Attach the verified JWT payload to req.user.
       *
       * OrganizationMembershipGuard uses req.user.sub
       * to resolve the caller's organization membership.
       */
      (
        request as Request & {
          user: JwtAccessPayload;
        }
      ).user = payload;

      return true;
    } catch {
      throw new UnauthorizedException(
        'Invalid or expired access token',
      );
    }
  }
}