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
  // current production AppController (Stage B7) intentionally exposes no
  // routes of its own: the health contract moved to the HealthModule
  // (GET /api/health, apps/api/src/health/health.controller.ts). There is
  // deliberately no AppController health() method left to test, so the
  // stale health() test was removed and this suite only asserts the
  // controller instantiation.
  it('should be defined with no routes of its own (health lives in HealthModule)', () => {
    expect(appController).toBeDefined();
  });
});
