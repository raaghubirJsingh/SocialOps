import { registerFreelancer } from '../lib/auth-client';
import { apiFetch } from '../lib/api';
import { createFreelancerProfile } from '../lib/freelancer-api';

jest.mock('../lib/api', () => ({ apiFetch: jest.fn() }));

const mockedApiFetch = jest.mocked(apiFetch);

describe('auth-client freelancer helpers', () => {
  beforeEach(() => mockedApiFetch.mockReset());

  it('registerFreelancer posts to /auth/register-freelancer', async () => {
    mockedApiFetch.mockResolvedValue({ status: 'verification_required', email: 'a@b.com' });
    await registerFreelancer({
      fullName: 'x',
      email: 'a@b.com',
      phone: { country: 'IN', number: '9876543210' },
      password: 'password123',
    });
    expect(mockedApiFetch).toHaveBeenCalledWith('/auth/register-freelancer', expect.objectContaining({ method: 'POST' }));
  });

  it('createFreelancerProfile posts to /freelancers/me/profile', async () => {
    mockedApiFetch.mockResolvedValue({ id: 'p1' });
    await createFreelancerProfile();
    expect(mockedApiFetch).toHaveBeenCalledWith('/freelancers/me/profile', expect.objectContaining({ method: 'POST' }));
  });
});