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
        'Stage B7 (Authentication + RBAC Foundation) exposes user registration, ' +
        'login, refresh-token rotation, and logout under the `auth` tag, ' +
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
          'Paste the `accessToken` returned from /api/auth/login or /api/auth/register.',
      },
      'bearer',
    )
    .addTag('auth', 'Authentication: register, login, refresh, logout.')
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

  await app.listen(process.env.PORT ?? 4000);
}

await bootstrap();