import { describe, it, expect } from '@jest/globals';
import { readFileSync } from 'node:fs';

describe('freelancer dashboard redirect contract', () => {
  const source = readFileSync('app/(app)/dashboard/page.tsx', 'utf8');

  it('contains the Freelancer redirect guard', () => {
    expect(source).toMatch(/isFreelancerAccount/);
    expect(source).toMatch(/getFreelancerProfile/);
    expect(source).toMatch(/freelancerProfile &&/);
    expect(source).toMatch(/profileCompletedAt === null/);
    expect(source).toMatch(/router\.replace\('\/freelancer\/profile'\)/);
  });
});