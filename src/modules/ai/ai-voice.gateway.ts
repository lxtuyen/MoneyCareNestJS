import { Injectable, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import { IncomingMessage } from 'http';
import { Duplex } from 'stream';
import { WebSocketServer } from 'ws';
import { AiVoiceSessionService } from './ai-voice-session.service';

@Injectable()
export class AiVoiceGateway
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private server?: WebSocketServer;
  private readonly path = '/ai/voice/live';

  constructor(
    private readonly adapterHost: HttpAdapterHost,
    private readonly voiceSessionService: AiVoiceSessionService,
  ) {}

  onApplicationBootstrap() {
    this.server = new WebSocketServer({ noServer: true });

    this.server.on('connection', async (socket, request) => {
      await this.voiceSessionService.handleOpen(
        socket,
        this.extractToken(request),
      );

      socket.on('message', (message) => {
        void this.voiceSessionService.handleRawMessage(socket, message);
      });
      socket.on('close', () => {
        void this.voiceSessionService.handleClose(socket);
      });
      socket.on('error', () => {
        void this.voiceSessionService.handleClose(socket);
      });
    });

    const httpServer = this.adapterHost.httpAdapter.getHttpServer();
    httpServer.on(
      'upgrade',
      (request: IncomingMessage, socket: Duplex, head: Buffer) => {
        if (!this.isVoicePath(request)) return;

        this.server?.handleUpgrade(request, socket, head, (client) => {
          this.server?.emit('connection', client, request);
        });
      },
    );
  }

  onApplicationShutdown() {
    this.server?.close();
  }

  private isVoicePath(request: IncomingMessage) {
    if (!request.url) return false;
    return new URL(request.url, 'http://localhost').pathname === this.path;
  }

  private extractToken(request: IncomingMessage) {
    const header = request.headers.authorization;
    if (header?.startsWith('Bearer ')) {
      return header.substring('Bearer '.length);
    }

    if (!request.url) return undefined;
    const url = new URL(request.url, 'http://localhost');
    return url.searchParams.get('token') ?? undefined;
  }
}
