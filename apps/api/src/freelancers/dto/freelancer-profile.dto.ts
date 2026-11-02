import { z } from 'zod';

import { userPhoneSchema } from '../../registration/dto/user-phone.dto.js';

/**
 * PATCH /api/freelancers/me/profile
 *
 * Partial profile update. Server-controlled completion fields and
 * timestamps are intentionally absent: they are derived/computed by the
 * backend and can never be supplied by the client.
 */
export const updateFreelancerProfileSchema = z
  .object({
    basicInfo: z.record(z.unknown()).optional(),
    phone: userPhoneSchema,
    professionalIntro: z.string().trim().min(1).max(5000).nullable().optional(),
    skills: z.unknown().nullable().optional(),
    workExperience: z.unknown().nullable().optional(),
    education: z.unknown().nullable().optional(),
    noWorkExperience: z.boolean().optional(),
    noFormalEducation: z.boolean().optional(),
  })
  .strict();

export type UpdateFreelancerProfileDto = z.infer<
  typeof updateFreelancerProfileSchema
>;

export interface FreelancerProfileResponse {
  id: string;
  userId: string;
  basicInfoCompleted: boolean;
  introCompleted: boolean;
  skillsCompleted: boolean;
  experienceCompleted: boolean;
  educationCompleted: boolean;
  reviewConfirmed: boolean;
  profileCompletedAt: string | null;
  basicInfo: unknown;
  professionalIntro: string | null;
  skills: unknown;
  workExperience: unknown;
  education: unknown;
  noWorkExperience: boolean;
  noFormalEducation: boolean;
  createdAt: string;
  updatedAt: string;
  user: {
    id: string;
    email: string;
    fullName: string | null;
    phone: string | null;
  };
}
