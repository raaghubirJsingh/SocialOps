import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';

describe('AppController', () => {
  let appController: AppController;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [AppService],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  // The original bootstrap exposed a root "Hello World!" endpoint, but the
  // current production AppController (Stage B7) intentionally exposes only
  // `GET /health`. The corresponding `Hello World!` test has been removed
  // because no production contract returns that string. The remaining test
  // verifies the controller returns a healthy status via its actual
  // `health()` method, which is what the public route serves.
  describe('health', () => {
    it('should return a healthy status from the AppController', () => {
      expect(appController.health()).toEqual({
        status: 'ok',
        service: 'socialops-api',
      });
    });
  });
});
