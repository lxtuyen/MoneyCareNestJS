import {
  AI_VOICE_INPUT_MIME_TYPE,
  parseAiVoiceClientMessage,
} from './ai-voice.types';

describe('ai voice protocol', () => {
  it('parses start messages with optional locale', () => {
    expect(
      parseAiVoiceClientMessage(
        JSON.stringify({ type: 'start', userId: 1, locale: 'vi-VN' }),
      ),
    ).toEqual({ type: 'start', userId: 1, locale: 'vi-VN' });
  });

  it('defaults audio mime type and requires audio data', () => {
    expect(
      parseAiVoiceClientMessage(JSON.stringify({ type: 'audio', data: 'abc' })),
    ).toEqual({
      type: 'audio',
      mimeType: AI_VOICE_INPUT_MIME_TYPE,
      data: 'abc',
    });

    expect(() =>
      parseAiVoiceClientMessage(JSON.stringify({ type: 'audio', data: '' })),
    ).toThrow('EMPTY_AUDIO');
  });

  it('rejects unknown message types', () => {
    expect(() =>
      parseAiVoiceClientMessage(JSON.stringify({ type: 'noop' })),
    ).toThrow('UNKNOWN_MESSAGE_TYPE');
  });
});
