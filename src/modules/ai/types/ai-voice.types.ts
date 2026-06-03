export type AiVoiceClientMessage =
  | AiVoiceStartMessage
  | AiVoiceAudioMessage
  | AiVoiceStopMessage;

export interface AiVoiceStartMessage {
  type: 'start';
  userId?: number;
  locale?: string;
}

export interface AiVoiceAudioMessage {
  type: 'audio';
  mimeType?: string;
  data?: string;
}

export interface AiVoiceStopMessage {
  type: 'stop';
}

export type AiVoiceServerMessage =
  | AiVoiceReadyMessage
  | AiVoiceTranscriptMessage
  | AiVoiceAudioResponseMessage
  | AiVoiceErrorMessage
  | AiVoiceDoneMessage;

export interface AiVoiceReadyMessage {
  type: 'ready';
  sessionId: string;
}

export interface AiVoiceTranscriptMessage {
  type: 'transcript';
  role: 'user' | 'model';
  text: string;
  final: boolean;
}

export interface AiVoiceAudioResponseMessage {
  type: 'audio';
  mimeType: 'audio/pcm;rate=24000';
  data: string;
}

export interface AiVoiceErrorMessage {
  type: 'error';
  code: string;
  message: string;
}

export interface AiVoiceDoneMessage {
  type: 'done';
}

export const AI_VOICE_INPUT_MIME_TYPE = 'audio/pcm;rate=16000';
export const AI_VOICE_OUTPUT_MIME_TYPE = 'audio/pcm;rate=24000';

export function parseAiVoiceClientMessage(
  raw: string,
): AiVoiceClientMessage {
  let payload: unknown;

  try {
    payload = JSON.parse(raw);
  } catch {
    throw new Error('INVALID_JSON');
  }

  if (!payload || typeof payload !== 'object') {
    throw new Error('INVALID_MESSAGE');
  }

  const message = payload as Record<string, unknown>;

  if (message.type === 'start') {
    const userId =
      typeof message.userId === 'number' && Number.isFinite(message.userId)
        ? message.userId
        : undefined;
    const locale =
      typeof message.locale === 'string' && message.locale.trim()
        ? message.locale.trim()
        : undefined;

    return { type: 'start', userId, locale };
  }

  if (message.type === 'audio') {
    const mimeType =
      typeof message.mimeType === 'string' ? message.mimeType.trim() : '';
    const data = typeof message.data === 'string' ? message.data.trim() : '';

    if (!data) {
      throw new Error('EMPTY_AUDIO');
    }

    return {
      type: 'audio',
      mimeType: mimeType || AI_VOICE_INPUT_MIME_TYPE,
      data,
    };
  }

  if (message.type === 'stop') {
    return { type: 'stop' };
  }

  throw new Error('UNKNOWN_MESSAGE_TYPE');
}
