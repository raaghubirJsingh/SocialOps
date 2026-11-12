'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useSession } from '@/hooks/use-session';
import { UserPhoneInput } from '@/components/shared/user-phone-input';
import {
  getFreelancerProfile,
  submitFreelancerProfile,
  updateFreelancerProfile,
  type FreelancerProfileResponse,
} from '@/lib/freelancer-api';
import {
  countryFromE164,
  nationalNumberFromE164,
  normalizeSelectedUserPhone,
} from '@/lib/user-phone';

function parseJsonField(value: string): unknown | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    throw new Error('Work experience and education must be valid JSON');
  }
}


export default function FreelancerProfilePage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { session, isLoading: sessionLoading } = useSession();
  const isFreelancer =
    session?.user?.accountType === 'FREELANCER' &&
    session.user.isEmployee !== true &&
    session.user.isSocialOpsAdmin !== true;

  useEffect(() => {
    if (!sessionLoading && !isFreelancer) {
      router.replace('/dashboard');
    }
  }, [isFreelancer, router, sessionLoading]);

  const {
    data: profile,
    isPending,
    isError,
    error,
  } = useQuery<FreelancerProfileResponse>({
    queryKey: ['freelancer-profile'],
    queryFn: getFreelancerProfile,
    enabled: !sessionLoading && isFreelancer,
    retry: 0,
  });

  if (!isFreelancer) {
    return null;
  }

  if (isPending) {
    return <p className="p-6 text-sm text-slate-400">Loading profile…</p>;
  }

  if (isError || !profile) {
    return (
      <p className="p-6 text-sm text-red-400">
        Unable to load profile.{' '}
        <span className="text-xs text-slate-400">
          ({(error as Error)?.message ?? 'unknown error'})
        </span>
      </p>
    );
  }

  return (
    <FreelancerProfileForm
      profile={profile}
      onSaved={() => void queryClient.invalidateQueries({ queryKey: ['freelancer-profile'] })}
    />
  );
}

function FreelancerProfileForm({
  profile,
  onSaved,
}: {
  profile: FreelancerProfileResponse;
  onSaved: () => void;
}) {
  const [professionalIntro, setProfessionalIntro] = useState(
    profile.professionalIntro ?? '',
  );
  const [phoneCountry, setPhoneCountry] = useState<string>(() =>
    countryFromE164(profile.user.phone),
  );
  const [phoneNumber, setPhoneNumber] = useState(() =>
    nationalNumberFromE164(profile.user.phone),
  );
  const [skills, setSkills] = useState(
    Array.isArray(profile.skills) ? profile.skills.join(', ') : '',
  );
  const [workExperience, setWorkExperience] = useState(
    profile.workExperience ? JSON.stringify(profile.workExperience) : '',
  );
  const [education, setEducation] = useState(
    profile.education ? JSON.stringify(profile.education) : '',
  );
  const [noWorkExperience, setNoWorkExperience] = useState(profile.noWorkExperience);
  const [noFormalEducation, setNoFormalEducation] = useState(profile.noFormalEducation);
  const [message, setMessage] = useState<string | null>(null);
  const [phoneError, setPhoneError] = useState<string | null>(null);

  const saveMutation = useMutation({
    mutationFn: () => {
      if (!normalizeSelectedUserPhone(phoneCountry, phoneNumber)) {
        const error = 'Select a country and enter a valid mobile number for it.';
        setPhoneError(error);
        throw new Error(error);
      }
      setPhoneError(null);
      return updateFreelancerProfile({
        phone: { country: phoneCountry, number: phoneNumber.trim() },
        professionalIntro: professionalIntro.trim() || null,
        skills: skills
          .split(',')
          .map((value) => value.trim())
          .filter(Boolean),
        workExperience: parseJsonField(workExperience),
        education: parseJsonField(education),
        noWorkExperience,
        noFormalEducation,
      });
    },
    onSuccess: () => {
      setMessage('Profile saved.');
      onSaved();
    },
    onError: (error: Error) => setMessage(error.message),
  });

  const submitMutation = useMutation({
    mutationFn: submitFreelancerProfile,
    onSuccess: () => {
      setMessage('Profile submitted.');
      onSaved();
    },
    onError: (error: Error) => setMessage(error.message),
  });
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 p-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold text-slate-100">Freelancer profile</h1>
        <p className="text-sm text-slate-400">
          Complete all six sections before accessing protected Freelancer features.
        </p>
      </header>

      <section className="space-y-2">
        <h2 className="text-lg font-medium text-slate-200">Basic information</h2>
        <p className="text-sm text-slate-400">
          {profile.user.fullName ?? '—'} · {profile.user.email}
        </p>
        <p className="text-xs text-slate-500">
          Status: {profile.basicInfoCompleted ? 'Complete' : 'Incomplete'}
        </p>
        <div className="max-w-2xl space-y-2">
          <UserPhoneInput
            idPrefix="freelancer-profile-phone"
            country={phoneCountry}
            number={phoneNumber}
            onCountryChange={(country) => {
              setPhoneCountry(country);
              setPhoneError(null);
            }}
            onNumberChange={(number) => {
              setPhoneNumber(number);
              setPhoneError(null);
            }}
            error={phoneError ?? undefined}
          />
          <span className="text-xs text-slate-400">
            Select the country first; a valid mobile number is required to
            complete your profile. The server stores it in E.164 format.
          </span>
        </div>
      </section>

      <label className="flex flex-col gap-2">
        <span className="text-sm font-medium text-slate-200">Professional introduction</span>
        <textarea
          className="min-h-24 rounded border border-slate-700 bg-slate-900 p-2 text-slate-100"
          value={professionalIntro}
          onChange={(event) => setProfessionalIntro(event.target.value)}
        />
      </label>

      <label className="flex flex-col gap-2">
        <span className="text-sm font-medium text-slate-200">Skills (comma separated)</span>
        <input
          className="rounded border border-slate-700 bg-slate-900 p-2 text-slate-100"
          value={skills}
          onChange={(event) => setSkills(event.target.value)}
        />
      </label>

      <label className="flex flex-col gap-2">
        <span className="text-sm font-medium text-slate-200">Work experience (JSON)</span>
        <textarea
          className="min-h-24 rounded border border-slate-700 bg-slate-900 p-2 font-mono text-slate-100"
          value={workExperience}
          onChange={(event) => setWorkExperience(event.target.value)}
        />
        <label className="flex items-center gap-2 text-sm text-slate-300">
          <input
            type="checkbox"
            checked={noWorkExperience}
            onChange={(event) => setNoWorkExperience(event.target.checked)}
          />
          No prior work experience
        </label>
      </label>

      <label className="flex flex-col gap-2">
        <span className="text-sm font-medium text-slate-200">Education (JSON)</span>
        <textarea
          className="min-h-24 rounded border border-slate-700 bg-slate-900 p-2 font-mono text-slate-100"
          value={education}
          onChange={(event) => setEducation(event.target.value)}
        />
        <label className="flex items-center gap-2 text-sm text-slate-300">
          <input
            type="checkbox"
            checked={noFormalEducation}
            onChange={(event) => setNoFormalEducation(event.target.checked)}
          />
          No formal education
        </label>
      </label>

      <div className="flex gap-3">
        <button
          type="button"
          className="rounded bg-slate-700 px-4 py-2 text-slate-100"
          disabled={saveMutation.isPending}
          onClick={() => saveMutation.mutate()}
        >
          Save
        </button>
        <button
          type="button"
          className="rounded bg-blue-600 px-4 py-2 text-white"
          disabled={submitMutation.isPending}
          onClick={() => submitMutation.mutate()}
        >
          Review and submit
        </button>
      </div>

      {message ? <p className="text-sm text-slate-300">{message}</p> : null}
      {profile.profileCompletedAt ? (
        <p className="text-sm text-green-400">
          Profile completed on {new Date(profile.profileCompletedAt).toLocaleString()}.
        </p>
      ) : (
        <p className="text-sm text-amber-400">Profile not yet submitted.</p>
      )}
    </div>
  );
}
