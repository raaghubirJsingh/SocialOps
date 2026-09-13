import { Test } from '@nestjs/testing';
import { JwtModule } from '@nestjs/jwt';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { jest } from '@jest/globals';

type MockAuthService = {
  login: jest.Mock;
  register: jest.Mock;
  refresh: jest.Mock;
  logout: jest.Mock;
  verifyEmail: jest.Mock;
  resendVerification: jest.Mock;
};

const makeMockService = (overrides: Partial<MockAuthService> = {}): MockAuthService => ({
  login: jest.fn(),
  register: jest.fn(),
  refresh: jest.fn(),
  logout: jest.fn(),
  verifyEmail: jest.fn(),
  resendVerification: jest.fn(),
  ...overrides,
});

describe('AuthController', () => {
  let controller: AuthController;
  let mockService: MockAuthService;

  beforeEach(async()=>{
    mockService=makeMockService();
    const module=await Test.createTestingModule({
      imports:[JwtModule.register({secret:'test-jwt-secret-32-chars-minimum'})],
      controllers:[AuthController],
      providers:[{provide:AuthService,useValue:mockService}]
    }).compile();
    controller=module.get(AuthController);
  });

  describe('POST /auth/register',()=>{
    it('returns the verification_required branch unchanged (production path)',async()=>{
      const registration={status:'verification_required' as const, email:'a@b.com'};
      // Registration issues NO tokens: the mock resolves to the
      // verification-required RegisterResult (AGENTS.md §17.2).
      mockService.register = jest.fn(async () => registration);
      const dto={
        accountType: 'SERVICE_PROVIDER' as const,
        fullName: 'New User',
        email: 'a@b.com',
        password: 'Password123!',
      };
      const result=await controller.register(dto);
      expect(result).toBe(registration);
      expect(mockService.register).toHaveBeenCalledWith(dto);
    });

    it('passes through the registration_complete branch unchanged (dev-only bypass path)',async()=>{
      const registration={status:'registration_complete' as const, email:'a@b.com'};
      mockService.register = jest.fn(async () => registration);
      const dto={
        accountType: 'SERVICE_PROVIDER' as const,
        fullName: 'New User',
        email: 'a@b.com',
        password: 'Password123!',
      };
      const result=await controller.register(dto);
      expect(result).toBe(registration);
      // The dev-bypass response MUST NOT include a token: the contract
      // says login creates the session, registration does not.
      expect(result).not.toHaveProperty('accessToken');
      expect(result).not.toHaveProperty('refreshToken');
    });
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

  describe('POST /auth/login',()=>{
    it('calls authService.login with dto and returns tokens + user identity',async()=>{
      const loginResult = {
        accessToken: 'at',
        refreshToken: 'rt',
        user: {
          id: 'user-1',
          email: 'a@b.com',
          fullName: 'Service Provider E2E',
          accountType: 'SERVICE_PROVIDER' as const,
        },
      };
      mockService.login = jest.fn(async () => loginResult);
      const result = await controller.login({email:'a@b.com',password:'pass'});
      expect(result).toBe(loginResult);
      // The controller must surface the user identity fields the
      // frontend needs (AGENTS.md §17).
      expect(result.user).toEqual({
        id: 'user-1',
        email: 'a@b.com',
        fullName: 'Service Provider E2E',
        accountType: 'SERVICE_PROVIDER',
      });
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
