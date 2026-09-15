import { Injectable } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service.js';

/**
 * Employee Module V1 domain service (Phase 2).
 *
 * Read-only profile access for the authenticated employee. The 1:1
 * EmployeeProfile binding is already verified by EmployeeContextGuard
 * before any call reaches this service; scoping here is defense-in-depth
 * (the query is constrained by `userId` alone and can never return
 * another user's profile).
 */
@Injectable()
export class EmployeesService {
  constructor(private readonly prisma: PrismaService) {}

  /** The caller's own profile joined with non-secret identity fields. */
  getOwnProfile(userId: string) {
    return this.prisma.employeeProfile.findUnique({
      where: { userId },
      select: {
        id: true,
        userId: true,
        createdAt: true,
        updatedAt: true,
        user: { select: { id: true, email: true, fullName: true } },
      },
    });
  }
}
