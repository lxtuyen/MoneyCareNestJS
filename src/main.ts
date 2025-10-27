import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ValidationPipe } from '@nestjs/common'; // ✅ thêm dòng này

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // ✅ Cấu hình ValidationPipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // loại bỏ các field không có trong DTO
      forbidNonWhitelisted: true, // nếu có field lạ thì báo lỗi
      transform: true, // tự động convert kiểu dữ liệu (string -> number, ...)
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  // ✅ Cấu hình Swagger
  const config = new DocumentBuilder()
    .setTitle('MoneyCare API')
    .setDescription('API documentation for MoneyCare system')
    .setVersion('1.0')
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  await app.listen(3000);
}
bootstrap();
