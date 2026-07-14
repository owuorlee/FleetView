import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger, ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { InvalidPhoneFilter } from './common/invalid-phone.filter';
import { StreamGateway } from './stream/stream.gateway';
import type { IncomingMessage } from 'http';
import type { Duplex } from 'stream';

// Traccar event ids are BigInt (alerts.traccarEventId); Express JSON can't serialize them.
(BigInt.prototype as unknown as { toJSON: () => string }).toJSON = function () {
  return this.toString();
};

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('v1');
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }),
  );
  app.useGlobalFilters(new InvalidPhoneFilter());
  app.enableCors();
  app.enableShutdownHooks();

  // Attach the client WebSocket stream to the same HTTP server.
  const gateway = app.get(StreamGateway);
  const server = app.getHttpServer();
  server.on('upgrade', (req: IncomingMessage, socket: Duplex, head: Buffer) => {
    void gateway.handleUpgrade(req, socket, head);
  });

  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port);
  new Logger('Bootstrap').log(`FleetView backend listening on :${port} (+ WS /v1/stream)`);
}

bootstrap();
