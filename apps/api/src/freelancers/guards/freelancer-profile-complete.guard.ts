import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';

import type { JwtAccessPayload } from '../../auth/types/jwt-payload.type.js';
import { PrismaService } from '../../prisma/prisma.service.js';

export interface FreelancerCompleteRequest extends Request {
  user?: JwtAccessPayload;
}

@Injectable()
export class FreelancerProfileCompleteGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context
      .switchToHttp()
      .getRequest<FreelancerCompleteRequest>();

    const user = request.user;
    if (!user || typeof user.sub !== 'string') {
      throw new UnauthorizedException('Authentication required');
    }

    const account = await this.prisma.user.findUnique({
      where: { id: user.sub },
      select: {
        accountType: true,
        freelancerProfile: {
          select: { profileCompletedAt: true },
        },
      },
    });

    if (
      !account ||
      account.accountType !== 'FREELANCER' ||
      !account.freelancerProfile ||
      !account.freelancerProfile.profileCompletedAt
    ) {
      throw new ForbiddenException('Freelancer profile completion required');
    }

    return true;
  }
}
