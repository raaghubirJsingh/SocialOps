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

export interface FreelancerContextRequest extends Request {
  user?: JwtAccessPayload;
  freelancerProfile?: { id: string; userId: string };
}

@Injectable()
export class FreelancerContextGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context
      .switchToHttp()
      .getRequest<FreelancerContextRequest>();

    const user = request.user;
    if (!user || typeof user.sub !== 'string') {
      throw new UnauthorizedException('Authentication required');
    }

    const account = await this.prisma.user.findUnique({
      where: { id: user.sub },
      select: {
        accountType: true,
        freelancerProfile: { select: { id: true, userId: true } },
      },
    });

    if (
      !account ||
      account.accountType !== 'FREELANCER' ||
      !account.freelancerProfile
    ) {
      throw new ForbiddenException('Freelancer access denied');
    }

    request.freelancerProfile = account.freelancerProfile;
    return true;
  }
}
