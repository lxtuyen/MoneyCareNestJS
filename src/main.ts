import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ValidationPipe } from '@nestjs/common';
import * as admin from 'firebase-admin';
import * as path from 'path';
import * as fs from 'fs';

function initFirebaseAdmin() {
  if (admin.apps.length > 0) return;

  // Try service account JSON file first (local dev / Railway volume mount)
  const serviceAccountPath = path.resolve(
    __dirname,
    '..',
    'moneycare-f7e6b-firebase-adminsdk-fbsvc-e7492ba03b.json',
  );
  if (fs.existsSync(serviceAccountPath)) {
    const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
    return;
  }

  // Fallback: GOOGLE_APPLICATION_CREDENTIALS env var or ADC
  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
  });
}

async function bootstrap() {
  initFirebaseAdmin();

  const app = await NestFactory.create(AppModule);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  const config = new DocumentBuilder()
    .setTitle('MoneyCare API')
    .setDescription('API documentation for MoneyCare system')
    .setVersion('1.0')
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  app.enableCors();

  const port = process.env.PORT || 3000;
  await app.listen(port, '0.0.0.0');
}
bootstrap();
