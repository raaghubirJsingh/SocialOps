import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';

// The integration-test environment requires the JWT secrets in
// process.env because JwtModule (loaded by AuthModule) reads them
// at construction time. The values below are throwaway dev
// placeholders (AGENTS.md section 8) used only by this test file
// and never written to any tracked file.
if (!process.env.JWT_ACCESS_SECRET) process.env.JWT_ACCESS_SECRET = 'integration-swagger-access-secret-32-chars';
if (!process.env.JWT_REFRESH_SECRET) process.env.JWT_REFRESH_SECRET = 'integration-swagger-refresh-secret-32-chars';
if (!process.env.JWT_ACCESS_TTL) process.env.JWT_ACCESS_TTL = '900';
if (!process.env.JWT_REFRESH_TTL) process.env.JWT_REFRESH_TTL = '604800';

let app: INestApplication;
let http: ReturnType<typeof request>;

beforeAll(async () => {
  // Mirror the production bootstrap from src/main.ts so the integration
  // test exercises the same routing (global /api prefix, Swagger /docs mount,
  // DocumentBuilder config). AppModule already wires JwtAuthGuard and
  // OrganizationMembershipGuard as global APP_GUARDs; the Swagger routes are
  // registered by SwaggerModule.setup and are served by Express middleware
  // before NestJS routing, so the global guards do not apply to them.
  const moduleRef: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  app = moduleRef.createNestApplication();
  app.setGlobalPrefix('api');

  // Reuse the DocumentBuilder configuration from src/main.ts so the
  // generated OpenAPI document matches production. We intentionally use
  // the same configuration (title, description, version, bearer scheme,
  // tag set) so the assertions below exercise the production wiring.
  const swaggerConfig = new DocumentBuilder()
    .setTitle('SocialOps API')
    .setDescription(
      'SocialOps - social media operations management platform. ' +
        'Registration Phase v1.0 exposes staged conversational registration ' +
        '(pending registration + dual Email/WhatsApp OTP verification) under ' +
        'the `auth` tag via /auth/registration/*, plus employee registration, ' +
        'login, refresh-token rotation, and logout, ' +
        'and authenticated-membership read under the `memberships` tag. ' +
        'Organization context is provided through the `X-Organization-Id` ' +
        'header on every non-public route.',
    )
    .setVersion('0.1.0')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description:
          'Paste the `accessToken` returned from /api/auth/login. Registration NEVER returns tokens - complete the staged registration (dual Email + WhatsApp OTP verification, then password) and sign in via /api/auth/login.',
      },
      'bearer',
    )
    .addTag(
      'auth',
      'Authentication: staged registration (/auth/registration/*), employee ' +
        'registration, email verification, verification resend, login, ' +
        'refresh, logout. Legacy POST /auth/register is retired (L11).',
    )
    .addTag(
      'memberships',
      "Authenticated user's OrganizationMembership rows (joined with their organizations).",
    )
    .addTag(
      'rbac',
      'Organization-scoped routes. Every route under this tag requires the ' +
        '`X-Organization-Id` header and a verified membership for the ' +
        'authenticated user.',
    )
    .addTag('app', 'Application health and root endpoints.')
    .build();
  const swaggerDocument = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('docs', app, swaggerDocument);

  await app.init();
  http = request(app.getHttpServer());
});

afterAll(async () => {
  await app.close();
});

describe('Swagger / OpenAPI (real Nest bootstrap)', () => {
  it('GET /docs returns 200 with HTML content', async () => {
    const res = await http.get('/docs');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/html/);
  });

  it('GET /docs-json returns 200 with a valid OpenAPI 3.x document', async () => {
    const res = await http.get('/docs-json');
    expect(res.status).toBe(200);
    expect(res.body).toBeDefined();
    expect(typeof res.body.openapi).toBe('string');
    expect(res.body.openapi.startsWith('3.')).toBe(true);
  });

  it('GET /docs-json declares the expected route paths', async () => {
    const res = await http.get('/docs-json');
    expect(res.status).toBe(200);
    const paths: string[] = Object.keys(res.body.paths ?? {});
    expect(paths).toContain('/api/health');
    expect(paths).toContain('/api/auth/register-employee');
    expect(paths).toContain('/api/auth/registration/start');
    expect(paths).toContain('/api/auth/registration/otp/verify');
    expect(paths).toContain('/api/auth/registration/otp/resend');
    expect(paths).toContain('/api/auth/registration/password');
    expect(paths).toContain('/api/auth/registration/resume');
    expect(paths).toContain('/api/auth/login');
    // L11: the legacy public registration route is fully retired.
    expect(paths).not.toContain('/api/auth/register');
    expect(paths).toContain('/api/auth/refresh');
    expect(paths).toContain('/api/auth/logout');
    expect(paths).toContain('/api/memberships/me');
  });

  it('GET /docs-json declares the expected Swagger tags', async () => {
    const res = await http.get('/docs-json');
    expect(res.status).toBe(200);
    const tagNames: string[] = (res.body.tags ?? []).map(
      (t: { name: string }) => t.name,
    );
    // Existing implementation declares: app (AppController),
    // auth (AuthController), memberships + rbac
    // (MembershipsController). main.ts also adds rbac via addTag.
    expect(tagNames).toContain('app');
    expect(tagNames).toContain('auth');
    expect(tagNames).toContain('memberships');
    expect(tagNames).toContain('rbac');
  });

  it('GET /docs-json declares the bearer security scheme', async () => {
    const res = await http.get('/docs-json');
    expect(res.status).toBe(200);
    const schemes = res.body.components?.securitySchemes ?? {};
    // addBearerAuth(..., 'bearer') in main.ts registers the scheme
    // under the name 'bearer'.
    expect(schemes).toHaveProperty('bearer');
    expect(schemes.bearer.type).toBe('http');
    expect(schemes.bearer.scheme).toBe('bearer');
    expect(schemes.bearer.bearerFormat).toBe('JWT');
  });
});
