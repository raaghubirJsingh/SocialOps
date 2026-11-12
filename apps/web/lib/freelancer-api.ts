import { apiFetch } from './api';

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

export async function createFreelancerProfile(): Promise<FreelancerProfileResponse> {
  return apiFetch<FreelancerProfileResponse>('/freelancers/me/profile', {
    method: 'POST',
  });
}

export async function getFreelancerProfile(): Promise<FreelancerProfileResponse> {
  return apiFetch<FreelancerProfileResponse>('/freelancers/me/profile');
}

export async function updateFreelancerProfile(
  body: Record<string, unknown>,
): Promise<FreelancerProfileResponse> {
  return apiFetch<FreelancerProfileResponse>('/freelancers/me/profile', {
    method: 'PATCH',
    body,
  });
}

export async function submitFreelancerProfile(): Promise<FreelancerProfileResponse> {
  return apiFetch<FreelancerProfileResponse>('/freelancers/me/profile/submit', {
    method: 'POST',
  });
}
