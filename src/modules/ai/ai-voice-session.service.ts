import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { randomUUID } from 'crypto';
import { RawData, WebSocket } from 'ws';
import { Session } from '@google/genai';
import { JwtPayload } from 'src/common/interfaces/jwt-payload.interface';
import { AiGeminiClientService } from './ai-gemini-client.service';
import {
  AI_VOICE_INPUT_MIME_TYPE,
  AI_VOICE_OUTPUT_MIME_TYPE,
  AiVoiceClientMessage,
  AiVoiceServerMessage,
  parseAiVoiceClientMessage,
} from './types/ai-voice.types';

interface VoiceConnectionState {
  sessionId: string;
  userId?: number;
  locale: string;
  geminiSession?: Session;
  started: boolean;
}

@Injectable()
export class AiVoiceSessionService {
  private readonly states = new WeakMap<WebSocket, VoiceConnectionState>();

  constructor(
    private readonly geminiClient: AiGeminiClientService,
    private readonly jwtService: JwtService,
  ) {}

  async handleOpen(socket: WebSocket, token?: string) {
    const state: VoiceConnectionState = {
      sessionId: randomUUID(),
      userId: this.getUserIdFromToken(token),
      locale: 'vi-VN',
      started: false,
    };
    this.states.set(socket, state);
  }

  async handleRawMessage(socket: WebSocket, raw: RawData) {
    let message: AiVoiceClientMessage;

    try {
      message = parseAiVoiceClientMessage(raw.toString());
    } catch (error) {
      this.sendError(socket, this.errorCode(error), this.errorMessage(error));
      return;
    }

    try {
      await this.handleMessage(socket, message);
    } catch (error) {
      this.sendError(socket, 'VOICE_SESSION_ERROR', this.errorMessage(error));
    }
  }

  async handleClose(socket: WebSocket) {
    const state = this.states.get(socket);
    if (state?.geminiSession) {
      state.geminiSession.close();
    }
    this.states.delete(socket);
  }

  private async handleMessage(socket: WebSocket, message: AiVoiceClientMessage) {
    const state = this.getState(socket);

    if (message.type === 'start') {
      await this.startSession(socket, state, message.userId, message.locale);
      return;
    }

    if (message.type === 'audio') {
      if (!state.geminiSession || !state.started) {
        this.sendError(socket, 'VOICE_SESSION_NOT_READY', 'Voice session is not ready.');
        return;
      }

      state.geminiSession.sendRealtimeInput({
        audio: {
          data: message.data,
          mimeType: message.mimeType || AI_VOICE_INPUT_MIME_TYPE,
        },
      });
      return;
    }

    if (message.type === 'stop') {
      if (state.geminiSession) {
        state.geminiSession.sendRealtimeInput({ audioStreamEnd: true });
        state.geminiSession.close();
        state.geminiSession = undefined;
      }
      state.started = false;
      this.send(socket, { type: 'done' });
    }
  }

  private async startSession(
    socket: WebSocket,
    state: VoiceConnectionState,
    userId?: number,
    locale?: string,
  ) {
    state.userId = state.userId ?? userId;
    state.locale = locale || state.locale;

    if (!state.userId) {
      this.sendError(socket, 'USER_REQUIRED', 'userId is required.');
      return;
    }

    if (state.geminiSession) {
      state.geminiSession.close();
    }

    state.geminiSession = await this.geminiClient.connectLiveVoiceSession({
      locale: state.locale,
      userId: state.userId,
      onOpen: () => {
        state.started = true;
        this.send(socket, { type: 'ready', sessionId: state.sessionId });
      },
      onMessage: (message) => {
        const serverContent = message.serverContent;
        const inputText = serverContent?.inputTranscription?.text;
        const outputText = serverContent?.outputTranscription?.text;

        if (inputText) {
          this.send(socket, {
            type: 'transcript',
            role: 'user',
            text: inputText,
            final: Boolean(serverContent?.turnComplete),
          });
        }

        if (outputText) {
          this.send(socket, {
            type: 'transcript',
            role: 'model',
            text: outputText,
            final: Boolean(serverContent?.turnComplete),
          });
        }

        const audio = message.data;
        if (audio) {
          this.send(socket, {
            type: 'audio',
            mimeType: AI_VOICE_OUTPUT_MIME_TYPE,
            data: audio,
          });
        }

        if (serverContent?.turnComplete || serverContent?.generationComplete) {
          this.send(socket, { type: 'done' });
        }
      },
      onError: (error) => {
        this.sendError(socket, 'GEMINI_LIVE_ERROR', this.errorMessage(error));
      },
      onClose: () => {
        state.started = false;
        this.send(socket, { type: 'done' });
      },
    });
  }

  private getState(socket: WebSocket): VoiceConnectionState {
    const state = this.states.get(socket);
    if (!state) {
      throw new Error('VOICE_CONNECTION_NOT_INITIALIZED');
    }
    return state;
  }

  private getUserIdFromToken(token?: string): number | undefined {
    if (!token) return undefined;
    try {
      const payload = this.jwtService.verify<JwtPayload>(token);
      return payload.sub;
    } catch {
      return undefined;
    }
  }

  private send(socket: WebSocket, message: AiVoiceServerMessage) {
    if (socket.readyState !== WebSocket.OPEN) return;
    socket.send(JSON.stringify(message));
  }

  private sendError(socket: WebSocket, code: string, message: string) {
    this.send(socket, { type: 'error', code, message });
  }

  private errorCode(error: unknown) {
    return error instanceof Error ? error.message : 'VOICE_SESSION_ERROR';
  }

  private errorMessage(error: unknown) {
    if (error instanceof Error) {
      switch (error.message) {
        case 'INVALID_JSON':
          return 'Invalid JSON message.';
        case 'INVALID_MESSAGE':
          return 'Invalid voice message.';
        case 'EMPTY_AUDIO':
          return 'Audio data is required.';
        case 'UNKNOWN_MESSAGE_TYPE':
          return 'Unknown voice message type.';
        default:
          return error.message;
      }
    }
    return 'Voice session error.';
  }
}
