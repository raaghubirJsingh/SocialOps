import { BadRequestException, ConflictException, ForbiddenException, Injectable } from '@nestjs/common';

import { Prisma } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service.js';
import { isValidUserPhoneE164 } from '../registration/lib/user-phone.js';
import type { FreelancerProfileResponse } from './dto/freelancer-profile.dto.js';

function hasText(value: unknown): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

function isPrismaNull(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  // Prisma JSON-null / DB-null sentinels. They are singleton instances whose
  // toString() returns "Prisma.JsonNull" / "Prisma.DbNull" (see Prisma runtime).
  const str = (value as { toString?: () => string } | null)?.toString?.();
  if (str === 'Prisma.JsonNull' || str === 'Prisma.DbNull') return true;
  // Reference equality against the Prisma sentinels (same module instance).
  return value === Prisma.JsonNull || value === Prisma.DbNull;
}

function normalizeJson(value: unknown): unknown {
  return isPrismaNull(value) ? null : value;
}
function hasData(value: unknown): boolean {
  if (isPrismaNull(value)) return false;
  if (Array.isArray(value)) return value.length > 0;
  if (value !== null && typeof value === 'object') {
    return Object.keys(value as Record<string, unknown>).length > 0;
  }
  return false;
}

function toResponse(profile: any): FreelancerProfileResponse {
  return {
    id: profile.id,
    userId: profile.userId,
    basicInfoCompleted: profile.basicInfoCompleted,
    introCompleted: profile.introCompleted,
    skillsCompleted: profile.skillsCompleted,
    experienceCompleted: profile.experienceCompleted,
    educationCompleted: profile.educationCompleted,
    reviewConfirmed: profile.reviewConfirmed,
    profileCompletedAt: profile.profileCompletedAt?.toISOString() ?? null,
    basicInfo: normalizeJson(profile.basicInfo),
    professionalIntro: profile.professionalIntro,
    skills: normalizeJson(profile.skills),
    workExperience: normalizeJson(profile.workExperience),
    education: normalizeJson(profile.education),
    noWorkExperience: profile.noWorkExperience,
    noFormalEducation: profile.noFormalEducation,
  createdAt: profile.createdAt.toISOString(),
  updatedAt: profile.updatedAt.toISOString(),
  user: {
    id: profile.user.id,
    email: profile.user.email,
    fullName: profile.user.fullName,
    phone: profile.user.phone,
  },
};
}

@Injectable()
export class FreelancersService {
  constructor(private readonly prisma: PrismaService) {}

  async getOwnProfile(userId: string): Promise<FreelancerProfileResponse> {
    const profile = await this.prisma.freelancerProfile.findUnique({
      where: { userId },
      include: {
        user: { select: { id: true, email: true, fullName: true, phone: true } },
      },
    });

    if (!profile) {
      throw new ForbiddenException('Freelancer access denied');
    }

    const basicInfoCompleted = Boolean(
      profile.user.fullName &&
        profile.user.email &&
        profile.user.phone && isValidUserPhoneE164(profile.user.phone),
    );

    return toResponse({
      ...profile,
      basicInfoCompleted,
    });
  }

  async ensureOwnProfile(userId: string): Promise<FreelancerProfileResponse> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { accountType: true },
    });
    if (!user || user.accountType !== 'FREELANCER') {
      throw new ForbiddenException('Freelancer access denied');
    }

    const existing = await this.prisma.freelancerProfile.findUnique({
      where: { userId },
      include: {
        user: { select: { id: true, email: true, fullName: true, phone: true } },
      },
    });
    if (existing) {
      throw new ConflictException('Freelancer profile already exists');
    }

    let created;
    try {
      created = await this.prisma.freelancerProfile.create({
        data: { userId },
        include: {
          user: { select: { id: true, email: true, fullName: true, phone: true } },
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('Freelancer profile already exists');
      }
      throw error;
    }

    const basicInfoCompleted = Boolean(
      created.user.fullName &&
        created.user.email &&
        created.user.phone && isValidUserPhoneE164(created.user.phone),
    );
    return toResponse({ ...created, basicInfoCompleted });
  }


  async updateOwnProfile(
    userId: string,
    dto: {
      basicInfo?: Record<string, unknown> | null;
      phone?: string;
      professionalIntro?: string | null;
      skills?: unknown;
      workExperience?: unknown;
      education?: unknown;
      noWorkExperience?: boolean;
      noFormalEducation?: boolean;
    },
  ): Promise<FreelancerProfileResponse> {
    const profile = await this.prisma.freelancerProfile.findUnique({
      where: { userId },
      include: {
        user: { select: { id: true, email: true, fullName: true, phone: true } },
      },
    });

    if (!profile) {
      throw new ForbiddenException('Freelancer access denied');
    }

    const nextProfessionalIntro =
      dto.professionalIntro !== undefined
        ? dto.professionalIntro
        : profile.professionalIntro;

    const nextSkills =
      dto.skills !== undefined ? dto.skills : profile.skills;

    const nextWorkExperience =
      dto.workExperience !== undefined
        ? dto.workExperience
        : profile.workExperience;

    const nextEducation =
      dto.education !== undefined ? dto.education : profile.education;

    const nextNoWorkExperience =
      dto.noWorkExperience !== undefined
        ? dto.noWorkExperience
        : profile.noWorkExperience;

    const nextNoFormalEducation =
      dto.noFormalEducation !== undefined
        ? dto.noFormalEducation
        : profile.noFormalEducation;

    if (nextNoWorkExperience && hasData(nextWorkExperience)) {
      throw new BadRequestException(
        'Work experience cannot be provided when noWorkExperience is true',
      );
    }
    if (nextNoFormalEducation && hasData(nextEducation)) {
      throw new BadRequestException(
        'Education cannot be provided when noFormalEducation is true',
      );
    }

    const nextPhone = dto.phone ?? profile.user.phone;
    if (!nextPhone || !isValidUserPhoneE164(nextPhone)) {
      throw new BadRequestException('A valid mobile phone number is required');
    }

    const basicInfoCompleted = Boolean(
      profile.user.fullName && profile.user.email && isValidUserPhoneE164(nextPhone),
    );

    const introCompleted = hasText(nextProfessionalIntro);
    const skillsCompleted = hasData(nextSkills);
    const experienceCompleted = hasData(nextWorkExperience) || nextNoWorkExperience;
    const educationCompleted = hasData(nextEducation) || nextNoFormalEducation;

    const hadSubmittedProfile = profile.profileCompletedAt !== null;
    const hasEdits = Object.keys(dto).length > 0;

    const updated = await this.prisma.freelancerProfile.update({
      where: { userId },
      data: {
        ...(dto.phone !== undefined ? { user: { update: { phone: nextPhone } } } : {}),
        ...(dto.basicInfo !== undefined
          ? {
              basicInfo:
                dto.basicInfo === null
                  ? Prisma.DbNull
                  : (dto.basicInfo as Prisma.InputJsonValue),
            }
          : {}),
        ...(dto.professionalIntro !== undefined
          ? { professionalIntro: dto.professionalIntro }
          : {}),
        ...(dto.skills !== undefined
          ? {
              skills:
                dto.skills === null
                  ? Prisma.DbNull
                  : (dto.skills as Prisma.InputJsonValue),
            }
          : {}),
        ...(dto.workExperience !== undefined
          ? {
              workExperience:
                dto.workExperience === null
                  ? Prisma.DbNull
                  : (dto.workExperience as Prisma.InputJsonValue),
            }
          : {}),
        ...(dto.education !== undefined
          ? {
              education:
                dto.education === null
                  ? Prisma.DbNull
                  : (dto.education as Prisma.InputJsonValue),
            }
          : {}),
        ...(dto.noWorkExperience !== undefined
          ? { noWorkExperience: dto.noWorkExperience }
          : {}),
        ...(dto.noFormalEducation !== undefined
          ? { noFormalEducation: dto.noFormalEducation }
          : {}),
        basicInfoCompleted,
        introCompleted,
        skillsCompleted,
        experienceCompleted,
        educationCompleted,
        ...(hadSubmittedProfile && hasEdits
          ? { reviewConfirmed: false, profileCompletedAt: null }
          : {}),
      },
      include: {
        user: { select: { id: true, email: true, fullName: true, phone: true } },
      },
    });

    return toResponse(updated);
  }


  async submitOwnProfile(userId: string): Promise<FreelancerProfileResponse> {
    const profile = await this.prisma.freelancerProfile.findUnique({
      where: { userId },
      include: {
        user: { select: { id: true, email: true, fullName: true, phone: true } },
      },
    });

    if (!profile) {
      throw new ForbiddenException('Freelancer access denied');
    }

    const basicInfoCompleted = Boolean(
      profile.user.fullName &&
        profile.user.email &&
        profile.user.phone &&
        isValidUserPhoneE164(profile.user.phone),
    );
    const introCompleted = hasText(profile.professionalIntro);
    const skillsCompleted = hasData(profile.skills);
    const experienceCompleted =
      hasData(profile.workExperience) || profile.noWorkExperience;
    const educationCompleted =
      hasData(profile.education) || profile.noFormalEducation;

    if (
      !basicInfoCompleted ||
      !introCompleted ||
      !skillsCompleted ||
      !experienceCompleted ||
      !educationCompleted
    ) {
      throw new BadRequestException('Freelancer profile is incomplete');
    }

    const updated = await this.prisma.freelancerProfile.update({
      where: { userId },
      data: {
        basicInfoCompleted: true,
        introCompleted: true,
        skillsCompleted: true,
        experienceCompleted: true,
        educationCompleted: true,
        reviewConfirmed: true,
        profileCompletedAt: new Date(),
      },
      include: {
        user: { select: { id: true, email: true, fullName: true, phone: true } },
      },
    });

    return toResponse(updated);
  }
}
