import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module.js';

describe('AppController (e2e)', () => {
  let app: INestApplication<App>;

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

  it('/api (GET)', () => {
    return request(app.getHttpServer())
      .get('/api')
      .expect(200)
      .expect('Hello World!');
  });

  it('/api/health (GET)', () => {
    return request(app.getHttpServer())
      .get('/api/health')
      .expect(200)
      .expect({
        status: 'ok',
        service: 'socialops-api',
      });
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
