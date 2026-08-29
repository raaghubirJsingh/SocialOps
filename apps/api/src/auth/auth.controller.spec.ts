import { Test, TestingModule } from '@nestjs/testing';
import { JwtModule } from '@nestjs/jwt';
import { AuthController } from './auth.controller.js';
import { AuthService, type TokenPair } from './auth.service.js';

const makeMockService=(overrides)=>({login:vi.fn(),register:vi.fn(),refresh:vi.fn(),logout:vi.fn(),...overrides});

describe('AuthController',()=>{
  let controller, mockService;

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
      mockService.register=vi.fn().mockResolvedValue(tokens);
      const result=await controller.register({email:'a@b.com',password:'Password123!'});
      expect(result).toBe(tokens);
      expect(mockService.register).toHaveBeenCalledWith({email:'a@b.com',password:'Password123!'});
    });
  });

  describe('POST /auth/login',()=>{
    it('calls authService.login with dto and returns tokens',async()=>{
      const tokens={accessToken:'at',refreshToken:'rt'};
      mockService.login=vi.fn().mockResolvedValue(tokens);
      const result=await controller.login({email:'a@b.com',password:'pass'});
      expect(result).toBe(tokens);
    });
  });

  describe('POST /auth/refresh',()=>{
    it('calls authService.refresh with dto.refreshToken',async()=>{
      const tokens={accessToken:'at2',refreshToken:'rt2'};
      mockService.refresh=vi.fn().mockResolvedValue(tokens);
      const result=await controller.refresh({refreshToken:'old-token'});
      expect(result).toBe(tokens);
      expect(mockService.refresh).toHaveBeenCalledWith('old-token');
    });
  });

  describe('POST /auth/logout',()=>{
    it('calls authService.logout with dto.refreshToken',async()=>{
      mockService.logout=vi.fn().mockResolvedValue(undefined);
      await controller.logout({refreshToken:'token-to-revoke'});
      expect(mockService.logout).toHaveBeenCalledWith('token-to-revoke');
    });
  });
});
