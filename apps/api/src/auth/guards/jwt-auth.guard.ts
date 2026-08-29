import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
import type { JwtAccessPayload } from '../types/jwt-payload.type.js';

/**
 * Guard that extracts and verifies the JWT access token from the
 * `Authorization: Bearer <token>` header.
 *
 * Attaches `req.user` with `{ sub: string; email: string }` on success.
 * Throws `UnauthorizedException` on missing or invalid tokens.
 *
 * Server-side authoritative (AGENTS.md §8).
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly jwtService: JwtService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const authHeader = request.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing or malformed Authorization header');
    }

    const token = authHeader.slice(7);

    try {
      const payload = this.jwtService.verify<JwtAccessPayload>(token, {
        secret: process.env.JWT_ACCESS_SECRET,
      });

      // Attach the decoded user payload to the request for downstream use.
      (request as Request & { user: JwtAccessPayload }).user = payload;
      return true;
    } catch {
      throw new UnauthorizedException('Invalid or expired access token');
    }
  }
}
