import { jest } from '@jest/globals';

import type { JwtAccessPayload } from '../auth/types/jwt-payload.type.js';
import { FreelancersController } from './freelancers.controller.js';

describe('FreelancersController', () => {
  it('updates phone for the authenticated JWT subject', async () => {
    const updateOwnProfile = jest.fn(async () => ({}) as never);
    const controller = new FreelancersController({
      updateOwnProfile,
    } as never);

    await controller.update(
      { sub: 'authenticated-user' } as JwtAccessPayload,
      { phone: '+919876543210' },
    );

    expect(updateOwnProfile).toHaveBeenCalledWith('authenticated-user', {
      phone: '+919876543210',
    });
  });
});
