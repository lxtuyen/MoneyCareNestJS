import { Modality } from '@google/genai';
import { AiGeminiClientService } from './ai-gemini-client.service';

describe('AiGeminiClientService voice config', () => {
  const oldEnv = process.env;

  beforeEach(() => {
    process.env = {
      ...oldEnv,
      GEMINI_API_KEY: 'test-key',
      GEMINI_LIVE_MODEL: '',
      GEMINI_LIVE_VOICE: '',
    };
  });

  afterEach(() => {
    process.env = oldEnv;
  });

  it('uses the Gemini Live default model when env is empty', () => {
    const service = new AiGeminiClientService();

    expect(service.liveModel).toBe(
      'gemini-2.5-flash-native-audio-preview-12-2025',
    );
  });

  it('builds a Vietnamese audio-only live config', () => {
    const service = new AiGeminiClientService();
    const config = service.getLiveVoiceConfig(7, 'vi-VN');

    expect(config.responseModalities).toEqual([Modality.AUDIO]);
    expect(config.inputAudioTranscription).toEqual({});
    expect(config.outputAudioTranscription).toEqual({});
    expect(config.systemInstruction).toContain('Money Care');
    expect(config.systemInstruction).toContain('userId 7');
  });
});
