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
};

const makeMockService = (overrides: Partial<MockAuthService> = {}): MockAuthService => ({
  login: jest.fn(),
  register: jest.fn(),
  refresh: jest.fn(),
  logout: jest.fn(),
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
    it('calls authService.register with dto and returns tokens',async()=>{
      const tokens={accessToken:'at',refreshToken:'rt'};
      // The cast is required because Jest's jest.fn() infers the mock
      // implementation's return type as `never` by default, which causes
      // TypeScript to reject mockResolvedValue(tokens) on unconstrained
      // mocks. The runtime behavior is unchanged: the mock resolves to
      // whatever value is passed to mockResolvedValue.
      mockService.register = jest.fn(async () => tokens);
      const result=await controller.register({email:'a@b.com',password:'Password123!'});
      expect(result).toBe(tokens);
      expect(mockService.register).toHaveBeenCalledWith({email:'a@b.com',password:'Password123!'});
    });
  });

  describe('POST /auth/login',()=>{
    it('calls authService.login with dto and returns tokens',async()=>{
      const tokens={accessToken:'at',refreshToken:'rt'};
      mockService.login = jest.fn(async () => tokens);
      const result=await controller.login({email:'a@b.com',password:'pass'});
      expect(result).toBe(tokens);
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
