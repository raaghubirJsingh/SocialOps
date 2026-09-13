import type { ClientDto, ClientStatus, ClientOnboardingStatus } from '@/types/client';

const mockClient: ClientDto = {
  id: 'test-client-id',
  ownerUserId: 'test-user-id',
  type: 'INDIVIDUAL',
  name: 'Test Client',
  description: 'A test client',
  logoUrl: null,
  directEmail: 'test@example.com',
  directPhone: '+15551112222',
  primaryContactName: null,
  primaryContactPhone: null,
  website: null,
  addressLine1: null,
  addressLine2: null,
  city: null,
  state: null,
  country: null,
  postalCode: null,
  industry: null,
  status: 'ACTIVE',
  statusReason: null,
  statusChangedAt: null,
  onboardingStatus: 'ACTIVE',
  onboardingCompletedAt: null,
  notes: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

describe('Client Dashboard Contracts', () => {
  it('mockClient type satisfies ClientDto interface', () => {
    const check: ClientDto = mockClient;
    expect(check.name).toBe('Test Client');
    expect(check.type).toBe('INDIVIDUAL');
    expect(check.status).toBe('ACTIVE');
    expect(check.onboardingStatus).toBe('ACTIVE');
  });

  it('PENDING onboarding status is representable', () => {
    const pending: ClientOnboardingStatus = 'PENDING';
    const active: ClientOnboardingStatus = 'ACTIVE';
    expect(pending).not.toBe(active);
  });

  it('INACTIVE and SUSPENDED statuses are representable', () => {
    const inactive: ClientStatus = 'INACTIVE';
    const suspended: ClientStatus = 'SUSPENDED';
    const active: ClientStatus = 'ACTIVE';
    expect(inactive).not.toBe(active);
    expect(suspended).not.toBe(active);
  });

  it('ClientDto includes all required fields', () => {
    expect(mockClient).toHaveProperty('id');
    expect(mockClient).toHaveProperty('ownerUserId');
    expect(mockClient).toHaveProperty('type');
    expect(mockClient).toHaveProperty('name');
    expect(mockClient).toHaveProperty('directEmail');
    expect(mockClient).toHaveProperty('directPhone');
    expect(mockClient).toHaveProperty('status');
    expect(mockClient).toHaveProperty('onboardingStatus');
  });

  it('field-change PATCH response shapes are representable', () => {
    const applied = { status: 'APPLIED', field: 'NAME' };
    const pending = { status: 'PENDING_VERIFICATION', field: 'DIRECT_EMAIL', changeId: 'change-123' };
    expect(applied.status).toBe('APPLIED');
    expect(pending.status).toBe('PENDING_VERIFICATION');
    expect(pending.changeId).toBe('change-123');
  });

  it('cooldown error body shape is representable', () => {
    const cooldownError = { code: 'COOLDOWN_ACTIVE', retryAt: '2026-01-01T00:10:00.000Z' };
    expect(cooldownError.code).toBe('COOLDOWN_ACTIVE');
    expect(new Date(cooldownError.retryAt).toISOString()).toBe('2026-01-01T00:10:00.000Z');
  });
});
