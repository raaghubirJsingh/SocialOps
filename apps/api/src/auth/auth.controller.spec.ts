import { Test } from '@nestjs/testing';
import { JwtModule } from '@nestjs/jwt';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { registerEmployeeSchema } from './dto/register-employee.dto.js';
import { registerFreelancerSchema } from './dto/register-freelancer.dto.js';
import { jest } from '@jest/globals';

import type { LoginResult } from './dto/login-response.dto.js';

type MockAuthService = {
  registerEmployee: jest.Mock;
  registerFreelancer: jest.Mock;
  login: jest.Mock;
  refresh: jest.Mock;
  logout: jest.Mock;
  verifyEmail: jest.Mock;
  resendVerification: jest.Mock;
};

const makeMockService = (overrides: Partial<MockAuthService> = {}): MockAuthService => ({
  registerEmployee: jest.fn(),
  registerFreelancer: jest.fn(),
  login: jest.fn(),
  refresh: jest.fn(),
  logout: jest.fn(),
  verifyEmail: jest.fn(),
  resendVerification: jest.fn(),
  ...overrides,
});

describe('AuthController', () => {
  let app: INestApplication;
  let controller: AuthController;
  let mockService: MockAuthService;

  beforeEach(async()=>{
    mockService=makeMockService();
    const module=await Test.createTestingModule({
      imports:[JwtModule.register({secret:'test-jwt-secret-32-chars-minimum'})],
      controllers:[AuthController],
      providers:[{provide:AuthService,useValue:mockService}]
    }).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
    controller=module.get(AuthController);
  });

  afterEach(async () => {
    await app.close();
  });

  describe.each([
    {
      label: 'Employee',
      endpoint: '/api/auth/register-employee',
      method: 'registerEmployee' as const,
      validPhone: { country: 'GB', number: '7400123456' },
      expectedPhone: '+447400123456',
    },
    {
      label: 'Freelancer',
      endpoint: '/api/auth/register-freelancer',
      method: 'registerFreelancer' as const,
      validPhone: { country: 'IN', number: '9876543210' },
      expectedPhone: '+919876543210',
    },
  ])('POST $endpoint ($label API validation boundary)', ({
    endpoint,
    method,
    validPhone,
    expectedPhone,
  }) => {
    it.each([
      ['missing phone', undefined],
      ['malformed phone', { country: 'ZZ', number: '1234567890' }],
      ['non-mobile phone', { country: 'GB', number: '02070313000' }],
    ])('rejects %s with HTTP 400', async (_caseName, phone) => {
      const payload: Record<string, unknown> = {
        fullName: `${method} User`,
        email: `${method.toLowerCase()}@example.com`,
        password: 'password123',
      };
      if (phone !== undefined) payload.phone = phone;

      const response = await request(app.getHttpServer())
        .post(endpoint)
        .send(payload);

      expect(response.status).toBe(400);
      expect(mockService[method]).not.toHaveBeenCalled();
    });

    it('passes a valid selected-country phone to the service as E.164', async () => {
      mockService[method] = jest.fn(async () => ({
        status: 'verification_required' as const,
        email: `${method.toLowerCase()}@example.com`,
      }));

      const response = await request(app.getHttpServer())
        .post(endpoint)
        .send({
          fullName: `${method} User`,
          email: `${method.toLowerCase()}@example.com`,
          phone: validPhone,
          password: 'password123',
        });

      expect(response.status).toBe(201);
      expect(mockService[method]).toHaveBeenCalledWith(
        expect.objectContaining({ phone: expectedPhone }),
      );
    });
  });

  describe('POST /auth/register-freelancer', () => {
    it('delegates the validated registration body to AuthService', async () => {
      const request = {
        fullName: 'Freelancer One',
        email: 'freelancer@example.com',
        phone: { country: 'IN', number: '9876543210' },
        password: 'password123',
      };
      const validatedRequest = registerFreelancerSchema.parse(request);
      const response = {
        status: 'verification_required' as const,
        email: request.email,
      };
      mockService.registerFreelancer = jest.fn(async () => response);

      await expect(controller.registerFreelancer(validatedRequest)).resolves.toEqual(response);
      expect(mockService.registerFreelancer).toHaveBeenCalledWith({
        ...validatedRequest,
        phone: '+919876543210',
      });
    });

    it('requires a valid phone number', () => {
      expect(
        registerFreelancerSchema.safeParse({
          fullName: 'Freelancer One',
          email: 'freelancer@example.com',
          password: 'password123',
        }).success,
      ).toBe(false);
      expect(
        registerFreelancerSchema.safeParse({
          fullName: 'Freelancer One',
          email: 'freelancer@example.com',
          phone: { country: 'IN', number: '12345' },
          password: 'password123',
        }).success,
      ).toBe(false);
      expect(
        registerFreelancerSchema.parse({
          fullName: 'Freelancer One',
          email: 'freelancer@example.com',
          phone: { country: 'IN', number: '98765 43210' },
          password: 'password123',
        }).phone,
      ).toBe('+919876543210');
    });
  });

  it('requires and normalizes Employee phone at the API DTO boundary', () => {
    const base = {
      fullName: 'Employee One',
      email: 'employee@example.com',
      password: 'password123',
    };
    expect(registerEmployeeSchema.safeParse(base).success).toBe(false);
    expect(
      registerEmployeeSchema.safeParse({
        ...base,
        phone: { country: 'GB', number: '020 7031 3000' },
      }).success,
    ).toBe(false);
    expect(
      registerEmployeeSchema.parse({
        ...base,
        phone: { country: 'GB', number: '7400123456' },
      }).phone,
    ).toBe('+447400123456');
  });

  describe('POST /auth/verify-email',()=>{
    it('calls authService.verifyEmail with dto.token',async()=>{
      const response={status:'verified'};
      mockService.verifyEmail = jest.fn(async () => response);
      const result=await controller.verifyEmail({token:'raw-token'});
      expect(result).toBe(response);
      expect(mockService.verifyEmail).toHaveBeenCalledWith('raw-token');
    });
  });

  describe('POST /auth/resend-verification',()=>{
    it('calls authService.resendVerification with dto.email',async()=>{
      const response={status:'queued'};
      mockService.resendVerification = jest.fn(async () => response);
      const result=await controller.resendVerification({email:'a@b.com'});
      expect(result).toBe(response);
      expect(mockService.resendVerification).toHaveBeenCalledWith('a@b.com');
    });
  });

  describe('POST /auth/login', () => {
    it('calls authService.login with dto and returns tokens + user identity', async () => {
      const loginResult = {
        accessToken: 'at',
        refreshToken: 'rt',
        user: {
          id: 'user-1',
          email: 'a@b.com',
          fullName: 'Service Provider E2E',
          accountType: 'SERVICE_PROVIDER' as const,
          isEmployee: false,
          isSocialOpsAdmin: false,
        },
        email: 'a@b.com',
      };
      mockService.login = jest.fn(async () => loginResult);
      const result = await controller.login({ email: 'a@b.com', password: 'pass' });
      expect(result).toBe(loginResult);
      // The controller must surface the user identity fields the
      // frontend needs (AGENTS.md §17).
      // TypeScript requires a type guard for discriminated union
      if ('user' in result) {
        expect(result.user).toEqual({
          id: 'user-1',
          email: 'a@b.com',
          fullName: 'Service Provider E2E',
          accountType: 'SERVICE_PROVIDER',
          isEmployee: false,
          isSocialOpsAdmin: false,
        });
      }
    });
  });

  describe('POST /auth/refresh',()=>{
    it('calls authService.refresh with dto.refreshToken',async()=>{
      const tokens={accessToken:'at2',refreshToken:'rt2'};
      mockService.refresh = jest.fn(async () => tokens);
      const result=await controller.refresh({refreshToken:'old-token'});
      expect(result).toBe(tokens);
      expect(mockService.refresh).toHaveBeenCalledWith('old-token');
    });
  });

  describe('POST /auth/logout',()=>{
    it('calls authService.logout with dto.refreshToken',async()=>{
      mockService.logout = jest.fn(async () => undefined);
      await controller.logout({refreshToken:'token-to-revoke'});
      expect(mockService.logout).toHaveBeenCalledWith('token-to-revoke');
    });
  });
});
