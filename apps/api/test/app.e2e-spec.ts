import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import request from 'supertest';
import { AppModule } from './../src/app.module.js';

describe('AppController (e2e)', () => {
  let app: INestApplication;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    // Mirror the production bootstrap configuration from src/main.ts so the
    // tests exercise the same routing (global /api prefix, CORS, Swagger /docs).
    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.enableCors();

    const swaggerConfig = new DocumentBuilder()
      .setTitle('SocialOps API')
      .setDescription('SocialOps - social media operations management platform')
      .setVersion('0.1.0')
      .build();
    const swaggerDocument = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('docs', app, swaggerDocument);

    await app.init();
  });

  it('/api/health (GET)', async () => {
    const res = await request(app.getHttpServer()).get('/api/health').expect(200);

    // HealthService.check() returns { status, database, redis } - it is NOT the
    // original { status, service } bootstrap shape, so an exact-body assertion on
    // the old contract fails. Assert the real contract instead:
    //   - HTTP 200 and the overall readiness status;
    //   - PostgreSQL MUST be ok (this is stricter than the old assertion);
    //   - the redis key must be PRESENT, but is not required to be 'ok',
    //     because a degraded Redis is a legitimate local state (mirrors
    //     rbac.integration.spec.ts:165).
    expect(res.body.status).toBe('ok');
    expect(res.body.database.status).toBe('ok');
    expect(res.body.redis).toBeDefined();
  });

  it('/docs (GET) serves the Swagger UI', () => {
    return request(app.getHttpServer())
      .get('/docs')
      .expect(200)
      .expect('Content-Type', /html/);
  });

  it('/ (GET) is not routed (root moved under the /api prefix)', () => {
    return request(app.getHttpServer())
      .get('/')
      .expect(404);
  });

  afterEach(async () => {
    await app.close();
  });
});
