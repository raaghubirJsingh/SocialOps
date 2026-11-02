import { jest } from '@jest/globals';
import { BadRequestException, ForbiddenException } from '@nestjs/common';

import { FreelancersService } from './freelancers.service.js';
import { Prisma } from '@prisma/client';
import { updateFreelancerProfileSchema } from './dto/freelancer-profile.dto.js';

function makePrisma() {
  return {
    freelancerProfile: {
      findUnique: jest.fn() as any,
      update: jest.fn() as any,
    },
  };
}

describe('FreelancersService', () => {
  it('validates and normalizes profile phone updates', () => {
    expect(
      updateFreelancerProfileSchema.safeParse({ phone: { country: 'IN', number: '' } }).success,
    ).toBe(false);
    expect(
      updateFreelancerProfileSchema.safeParse({ phone: { country: 'IN', number: '12345' } }).success,
    ).toBe(false);
    expect(
      updateFreelancerProfileSchema.safeParse({
        phone: { country: 'IN', number: '9876543210' },
        userId: 'another-user',
      }).success,
    ).toBe(false);
    expect(
      updateFreelancerProfileSchema.parse({
        phone: { country: 'IN', number: '98765 43210' },
      }).phone,
    ).toBe('+919876543210');
    expect(
      updateFreelancerProfileSchema.safeParse({
        professionalIntro: 'Intro',
      }).success,
    ).toBe(false);
  });

  it('returns only the authenticated user profile', async () => {
    const prisma = makePrisma();
    const service = new FreelancersService(prisma as any);
    (prisma.freelancerProfile.findUnique as any).mockResolvedValue({
      id: 'profile-1',
      userId: 'user-1',
      basicInfoCompleted: false,
      introCompleted: false,
      skillsCompleted: false,
      experienceCompleted: false,
      educationCompleted: false,
      reviewConfirmed: false,
      profileCompletedAt: null,
      basicInfo: null,
      professionalIntro: null,
      skills: null,
      workExperience: null,
      education: null,
      noWorkExperience: false,
      noFormalEducation: false,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      user: { id: 'user-1', email: 'a@example.com', fullName: 'User', phone: '+919876543210' },
    });

    const result = await service.getOwnProfile('user-1');
    expect(result.id).toBe('profile-1');
    expect(result.user.email).toBe('a@example.com');
    expect(result.basicInfoCompleted).toBe(true);
  });

  it('rejects cross-user profile access', async () => {
    const prisma = makePrisma();
    const service = new FreelancersService(prisma as any);
    (prisma.freelancerProfile.findUnique as any).mockResolvedValue(null);

    await expect(service.getOwnProfile('user-2')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('derives completion flags and clears submission on edit', async () => {
    const prisma = makePrisma();
    const service = new FreelancersService(prisma as any);
    (prisma.freelancerProfile.findUnique as any).mockResolvedValue({
      id: 'profile-1',
      userId: 'user-1',
      basicInfoCompleted: false,
      introCompleted: false,
      skillsCompleted: false,
      experienceCompleted: false,
      educationCompleted: false,
      reviewConfirmed: true,
      profileCompletedAt: new Date('2026-01-02T00:00:00.000Z'),
      basicInfo: null,
      professionalIntro: null,
      skills: null,
      workExperience: null,
      education: null,
      noWorkExperience: false,
      noFormalEducation: false,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      user: { id: 'user-1', email: 'a@example.com', fullName: 'User', phone: '+919876543210' },
    });
    (prisma.freelancerProfile.update as any).mockResolvedValue({
      id: 'profile-1',
      userId: 'user-1',
      basicInfoCompleted: true,
      introCompleted: true,
      skillsCompleted: true,
      experienceCompleted: true,
      educationCompleted: true,
      reviewConfirmed: false,
      profileCompletedAt: null,
      basicInfo: null,
      professionalIntro: 'Intro',
      skills: ['TypeScript'],
      workExperience: null,
      education: null,
      noWorkExperience: true,
      noFormalEducation: true,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-03T00:00:00.000Z'),
      user: { id: 'user-1', email: 'a@example.com', fullName: 'User', phone: '+919876543210' },
    });

    const result = await service.updateOwnProfile('user-1', {
      professionalIntro: 'Intro',
      skills: ['TypeScript'],
      noWorkExperience: true,
      noFormalEducation: true,
    });

    expect(result.reviewConfirmed).toBe(false);
    expect(result.profileCompletedAt).toBeNull();
    expect(result.introCompleted).toBe(true);
    expect(result.skillsCompleted).toBe(true);
    expect(result.experienceCompleted).toBe(true);
    expect(result.educationCompleted).toBe(true);
  });

  it('updates phone on the authenticated user and recalculates basic-info completion', async () => {
    const prisma = makePrisma();
    const service = new FreelancersService(prisma as any);
    (prisma.freelancerProfile.findUnique as any).mockResolvedValue({
      id: 'profile-1',
      userId: 'user-1',
      basicInfoCompleted: false,
      introCompleted: false,
      skillsCompleted: false,
      experienceCompleted: false,
      educationCompleted: false,
      reviewConfirmed: false,
      profileCompletedAt: null,
      basicInfo: null,
      professionalIntro: null,
      skills: null,
      workExperience: null,
      education: null,
      noWorkExperience: false,
      noFormalEducation: false,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      user: { id: 'user-1', email: 'a@example.com', fullName: 'User', phone: null },
    });
    (prisma.freelancerProfile.update as any).mockResolvedValue({
      id: 'profile-1',
      userId: 'user-1',
      basicInfoCompleted: true,
      introCompleted: false,
      skillsCompleted: false,
      experienceCompleted: false,
      educationCompleted: false,
      reviewConfirmed: false,
      profileCompletedAt: null,
      basicInfo: null,
      professionalIntro: null,
      skills: null,
      workExperience: null,
      education: null,
      noWorkExperience: false,
      noFormalEducation: false,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-02T00:00:00.000Z'),
      user: {
        id: 'user-1',
        email: 'a@example.com',
        fullName: 'User',
        phone: '+919876543210',
      },
    });

    const result = await service.updateOwnProfile('user-1', {
      phone: '+919876543210',
    });

    expect(prisma.freelancerProfile.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'user-1' },
        data: expect.objectContaining({
          user: { update: { phone: '+919876543210' } },
          basicInfoCompleted: true,
        }),
      }),
    );
    expect(result.user.phone).toBe('+919876543210');
  });
  it('submits when all sections are complete', async () => {
    const prisma = makePrisma();
    const service = new FreelancersService(prisma as any);
    (prisma.freelancerProfile.findUnique as any).mockResolvedValue({
      id: 'profile-1',
      userId: 'user-1',
      basicInfoCompleted: true,
      introCompleted: true,
      skillsCompleted: true,
      experienceCompleted: true,
      educationCompleted: true,
      reviewConfirmed: false,
      profileCompletedAt: null,
      basicInfo: null,
      professionalIntro: 'Intro',
      skills: ['TypeScript'],
      workExperience: null,
      education: null,
      noWorkExperience: true,
      noFormalEducation: true,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      user: { id: 'user-1', email: 'a@example.com', fullName: 'User', phone: '+919876543210' },
    });
    (prisma.freelancerProfile.update as any).mockResolvedValue({
      id: 'profile-1',
      userId: 'user-1',
      basicInfoCompleted: true,
      introCompleted: true,
      skillsCompleted: true,
      experienceCompleted: true,
      educationCompleted: true,
      reviewConfirmed: true,
      profileCompletedAt: new Date('2026-01-04T00:00:00.000Z'),
      basicInfo: null,
      professionalIntro: 'Intro',
      skills: ['TypeScript'],
      workExperience: null,
      education: null,
      noWorkExperience: true,
      noFormalEducation: true,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-04T00:00:00.000Z'),
      user: { id: 'user-1', email: 'a@example.com', fullName: 'User', phone: '+919876543210' },
    });

    const result = await service.submitOwnProfile('user-1');

    expect(result.reviewConfirmed).toBe(true);
    expect(result.profileCompletedAt).not.toBeNull();
  });

  it('rejects incomplete submission', async () => {
    const prisma = makePrisma();
    const service = new FreelancersService(prisma as any);
    (prisma.freelancerProfile.findUnique as any).mockResolvedValue({
      id: 'profile-1',
      userId: 'user-1',
      basicInfoCompleted: true,
      introCompleted: true,
      skillsCompleted: true,
      experienceCompleted: false,
      educationCompleted: true,
      reviewConfirmed: false,
      profileCompletedAt: null,
      basicInfo: null,
      professionalIntro: 'Intro',
      skills: ['TypeScript'],
      workExperience: null,
      education: null,
      noWorkExperience: false,
      noFormalEducation: true,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      user: { id: 'user-1', email: 'a@example.com', fullName: 'User', phone: '+919876543210' },
    });

    await expect(service.submitOwnProfile('user-1')).rejects.toThrow(
      'Freelancer profile is incomplete',
    );
  });

  it('rejects submission when the required phone number is missing', async () => {
    const prisma = makePrisma();
    const service = new FreelancersService(prisma as any);
    (prisma.freelancerProfile.findUnique as any).mockResolvedValue({
      id: 'profile-1',
      userId: 'user-1',
      basicInfoCompleted: true,
      introCompleted: true,
      skillsCompleted: true,
      experienceCompleted: true,
      educationCompleted: true,
      reviewConfirmed: false,
      profileCompletedAt: null,
      basicInfo: null,
      professionalIntro: 'Intro',
      skills: ['TypeScript'],
      workExperience: null,
      education: null,
      noWorkExperience: true,
      noFormalEducation: true,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      user: { id: 'user-1', email: 'a@example.com', fullName: 'User', phone: null },
    });

    await expect(service.submitOwnProfile('user-1')).rejects.toThrow(
      'Freelancer profile is incomplete',
    );
  });

  it('rejects contradictory no-formal-education selections', async () => {
    const prisma = makePrisma();
    const service = new FreelancersService(prisma as any);
    (prisma.freelancerProfile.findUnique as any).mockResolvedValue({
      id: 'profile-1',
      userId: 'user-1',
      basicInfoCompleted: true,
      introCompleted: true,
      skillsCompleted: true,
      experienceCompleted: true,
      educationCompleted: true,
      reviewConfirmed: false,
      profileCompletedAt: null,
      basicInfo: null,
      professionalIntro: 'Intro',
      skills: ['TypeScript'],
      workExperience: null,
      education: [{ school: 'State U' }],
      noWorkExperience: true,
      noFormalEducation: false,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      user: { id: 'user-1', email: 'a@example.com', fullName: 'User', phone: '+919876543210' },
    });

    await expect(
      service.updateOwnProfile('user-1', {
        noFormalEducation: true,
      }),
    ).rejects.toThrow('Education cannot be provided when noFormalEducation is true');
  });

});

describe('FreelancersService ensureOwnProfile', () => {
  it.each(['CLIENT', 'SERVICE_PROVIDER', null])(
    'rejects %s accounts',
    async (accountType) => {
    const prisma = {
      user: { findUnique: (jest.fn() as any).mockResolvedValue({ accountType }) },
      freelancerProfile: { findUnique: jest.fn() as any, create: jest.fn() as any },
    };
    const service = new FreelancersService(prisma as any);
    await expect(service.ensureOwnProfile('user-1')).rejects.toBeInstanceOf(
      (await import('@nestjs/common')).ForbiddenException,
    );
    },
  );

  it('throws ConflictException when profile already exists for a FREELANCER', async () => {
    const prisma = {
      user: { findUnique: (jest.fn() as any).mockResolvedValue({ accountType: 'FREELANCER' }) },
      freelancerProfile: {
        findUnique: (jest.fn() as any).mockResolvedValue({ id: 'p1', userId: 'user-1' }),
        create: jest.fn() as any,
      },
    };
    const service = new FreelancersService(prisma as any);
    const { ConflictException } = await import('@nestjs/common');
    await expect(service.ensureOwnProfile('user-1')).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('creates a missing profile only for a FREELANCER account', async () => {
    const created = {
      id: 'p1',
      userId: 'user-1',
      basicInfoCompleted: false,
      introCompleted: false,
      skillsCompleted: false,
      experienceCompleted: false,
      educationCompleted: false,
      reviewConfirmed: false,
      profileCompletedAt: null,
      basicInfo: null,
      professionalIntro: null,
      skills: null,
      workExperience: null,
      education: null,
      noWorkExperience: false,
      noFormalEducation: false,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      user: { id: 'user-1', email: 'a@example.com', fullName: 'User', phone: '+919876543210' },
    };
    const prisma = {
      user: { findUnique: (jest.fn() as any).mockResolvedValue({ accountType: 'FREELANCER' }) },
      freelancerProfile: {
        findUnique: (jest.fn() as any).mockResolvedValue(null),
        create: (jest.fn() as any).mockResolvedValue(created),
      },
    };
    const service = new FreelancersService(prisma as any);
    const result = await service.ensureOwnProfile('user-1');
    expect(result.id).toBe('p1');
    expect(prisma.freelancerProfile.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: { userId: 'user-1' } }),
    );
  });

  it('throws ConflictException on P2002 race', async () => {
    const prismaErr = new Error('unique');
    (prismaErr as any).code = 'P2002';
    (prismaErr as any).constructor = { name: 'PrismaClientKnownRequestError' };
    // Make instanceof check pass by using real Prisma class if available
    const { Prisma } = await import('@prisma/client');
    const PrismaClientKnownRequestError = (Prisma as any).PrismaClientKnownRequestError || Error;
    const err = Object.create(PrismaClientKnownRequestError.prototype);
    err.code = 'P2002';
    const prisma = {
      user: { findUnique: (jest.fn() as any).mockResolvedValue({ accountType: 'FREELANCER' }) },
      freelancerProfile: {
        findUnique: (jest.fn() as any).mockResolvedValue(null),
        create: (jest.fn() as any).mockRejectedValue(err),
      },
    };
    const service = new FreelancersService(prisma as any);
    const { ConflictException } = await import('@nestjs/common');
    await expect(service.ensureOwnProfile('user-1')).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('missing user follows existing intended error behavior', async () => {
    const prisma = {
      user: { findUnique: (jest.fn() as any).mockResolvedValue(null) },
      freelancerProfile: { findUnique: jest.fn() as any, create: jest.fn() as any },
    };
    const service = new FreelancersService(prisma as any);
    const { ForbiddenException } = await import('@nestjs/common');
    await expect(service.ensureOwnProfile('user-1')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });
});

describe('FreelancersService JSON null handling', () => {
  it('normalizes Prisma JSON-null and DB-null sentinels to JS null', async () => {
    const prisma = {
      freelancerProfile: {
        findUnique: (jest.fn() as any).mockResolvedValue({
          id: 'profile-1',
          userId: 'user-1',
          basicInfoCompleted: false,
          introCompleted: false,
          skillsCompleted: false,
          experienceCompleted: false,
          educationCompleted: false,
          reviewConfirmed: false,
          profileCompletedAt: null,
          basicInfo: (Prisma as any).JsonNull,
          professionalIntro: null,
          skills: (Prisma as any).DbNull,
          workExperience: null,
          education: null,
          noWorkExperience: false,
          noFormalEducation: false,
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
          updatedAt: new Date('2026-01-01T00:00:00.000Z'),
          user: { id: 'user-1', email: 'a@example.com', fullName: 'User', phone: '+919876543210' },
        }),
        update: jest.fn() as any,
      },
    };
    const service = new FreelancersService(prisma as any);
    const result = await service.getOwnProfile('user-1');
    expect(result.basicInfo).toBeNull();
    expect(result.skills).toBeNull();
  });

  it('clears nullable JSON fields with Prisma.DbNull (not JsonNull)', async () => {
    const prisma = {
      freelancerProfile: {
        findUnique: (jest.fn() as any).mockResolvedValue({
          id: 'profile-1',
          userId: 'user-1',
          basicInfoCompleted: false,
          introCompleted: false,
          skillsCompleted: false,
          experienceCompleted: false,
          educationCompleted: false,
          reviewConfirmed: false,
          profileCompletedAt: null,
          basicInfo: null,
          professionalIntro: null,
          skills: ['TypeScript'],
          workExperience: null,
          education: null,
          noWorkExperience: false,
          noFormalEducation: false,
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
          updatedAt: new Date('2026-01-01T00:00:00.000Z'),
          user: { id: 'user-1', email: 'a@example.com', fullName: 'User', phone: '+919876543210' },
        }),
        update: (jest.fn() as any).mockResolvedValue({
          id: 'profile-1',
          userId: 'user-1',
          basicInfoCompleted: false,
          introCompleted: false,
          skillsCompleted: false,
          experienceCompleted: false,
          educationCompleted: false,
          reviewConfirmed: false,
          profileCompletedAt: null,
          basicInfo: null,
          professionalIntro: null,
          skills: null,
          workExperience: null,
          education: null,
          noWorkExperience: false,
          noFormalEducation: false,
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
          updatedAt: new Date('2026-01-01T00:00:00.000Z'),
          user: { id: 'user-1', email: 'a@example.com', fullName: 'User', phone: '+919876543210' },
        }),
      },
    };
    const service = new FreelancersService(prisma as any);
    await service.updateOwnProfile('user-1', { basicInfo: null, skills: null });
    const call = (prisma.freelancerProfile.update as any).mock.calls[0][0];
    // The exact sentinel is asserted by reference equality against Prisma.DbNull.
    const { Prisma } = await import('@prisma/client');
    expect(call.data.basicInfo).toBe(Prisma.DbNull);
    expect(call.data.skills).toBe(Prisma.DbNull);
  });
});
