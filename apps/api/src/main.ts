import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger, LogLevel } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';

function getLogLevels(): LogLevel[] {
  const isDev = process.env.NODE_ENV !== 'production';
  const custom = process.env.LOG_LEVEL;

  if (custom) {
    return custom.split(',').map((s) => s.trim()) as LogLevel[];
  }

  if (isDev) {
    return ['error', 'warn', 'log', 'debug'];
  }

  return ['error', 'warn', 'log'];
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: getLogLevels(),
  });

  app.enableCors({
    origin: process.env.CORS_ORIGIN?.split(',') ?? ['http://localhost:3000'],
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: false,
    }),
  );

  app.setGlobalPrefix('', { exclude: ['health'] });

  const config = new DocumentBuilder()
    .setTitle('WhatsApp SaaS API')
    .setDescription('Backend para atendimento automatizado via WhatsApp')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, document);

  const port = process.env.PORT ?? 3001;
  await app.listen(port);

  const logger = new Logger('Bootstrap');
  logger.log(`API pronta em http://localhost:${port}`);
  logger.log(`http://localhost:${port}/docs`);

  const isDev = process.env.NODE_ENV !== 'production';
  if (isDev) {
    logger.log(
      `Logs: ${process.env.PRISMA_LOG === 'query' ? 'SQL verboso ligado' : 'SQL silencioso (PRISMA_LOG=query para ligar)'}`,
    );
  }
}

bootstrap();
