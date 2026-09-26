import { existsSync } from 'node:fs';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

import { AppModule } from './app.module.js';

// Load the local, gitignored apps/api/.env before anything initializes.
// Real environment variables always win: loadEnvFile never overrides values
// already present in process.env. The existence guard keeps deployments that
// rely on real environment configuration (no .env file) working unchanged
// (AGENTS.md section 8 - environment-based configuration, no hard-coded
// endpoints or secrets).
if (existsSync('.env')) {
  process.loadEnvFile();
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.setGlobalPrefix('api');
  app.enableCors();

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
    .addTag(
      'clients',
      'Client Module V1 - Agency-side operations (CRUD, status, invite, ' +
        'management requests). Requires `X-Organization-Id`; management ' +
        'operations require Agency OWNER or ADMIN.',
    )
    .addTag(
      'client',
      'Client Module V1 - Client self-service (profile, agency requests, ' +
        'relationships, discovery). Requires the bound User + X-Client-Id.',
    )
    .addTag(
      'client-onboarding',
      'Client Module V1 - controlled pre-activation flows (invitation ' +
        'acceptance, self-registration). These are the only PENDING-time ' +
        'exception paths.',
    )
    .addTag(
      'client-admin',
      'Client Module V1 - SOCIALOPS_ADMIN operations: Client status ' +
        'management and Agency discovery approval.',
    )
    .build();
  const swaggerDocument = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('docs', app, swaggerDocument);

  await app.listen(process.env.PORT ?? 4000);
}

await bootstrap();