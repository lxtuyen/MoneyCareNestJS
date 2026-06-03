import { Injectable } from '@nestjs/common';
import {
  GenerateContentConfig,
  GoogleGenAI,
  LiveServerMessage,
  Modality,
  Session,
} from '@google/genai';

const DEFAULT_MODEL = 'gemini-2.5-flash-lite';
const DEFAULT_LIVE_MODEL = 'gemini-2.5-flash-native-audio-preview-12-2025';

interface LiveVoiceSessionParams {
  userId: number;
  locale: string;
  onOpen: () => void;
  onMessage: (message: LiveServerMessage) => void;
  onError: (error: ErrorEvent) => void;
  onClose: () => void;
}

@Injectable()
export class AiGeminiClientService {
  private readonly genAI: GoogleGenAI;
  readonly chatModel: string;
  readonly parseModel: string;
  readonly analysisModel: string;
  readonly liveModel: string;

  constructor() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error('Missing GEMINI_API_KEY in environment variables');
    }
    this.genAI = new GoogleGenAI({ apiKey });
    this.chatModel = process.env.GEMINI_CHAT_MODEL || DEFAULT_MODEL;
    this.parseModel = process.env.GEMINI_PARSE_MODEL || this.chatModel;
    this.analysisModel = process.env.GEMINI_ANALYSIS_MODEL || this.chatModel;
    this.liveModel = process.env.GEMINI_LIVE_MODEL || DEFAULT_LIVE_MODEL;
  }

  generateContent(
    prompt: string,
    image?: Buffer,
    mimeType?: string,
    model = this.chatModel,
  ) {
    const parts: Array<{
      text?: string;
      inlineData?: { data: string; mimeType: string };
    }> = [{ text: prompt }];

    if (image && mimeType) {
      parts.push({ inlineData: { data: image.toString('base64'), mimeType } });
    }

    return this.genAI.models.generateContent({
      model,
      contents: [{ role: 'user', parts }],
    });
  }

  generateToolContent(
    prompt: string,
    config: GenerateContentConfig,
    model = this.parseModel,
  ) {
    return this.genAI.models.generateContent({
      model,
      contents: [
        {
          role: 'user',
          parts: [{ text: prompt }],
        },
      ],
      config,
    });
  }

  getLiveVoiceConfig(userId: number, locale = 'vi-VN') {
    return {
      responseModalities: [Modality.AUDIO],
      temperature: 0.4,
      systemInstruction:
        `Bạn là trợ lý tài chính AI của ứng dụng Money Care. ` +
        `Hãy trả lời ngắn gọn, rõ ràng bằng tiếng Việt, ưu tiên ngữ cảnh ${locale}. ` +
        `Người dùng hiện tại có userId ${userId}. ` +
        `Không tự ý tạo, sửa hoặc xóa giao dịch, ví, ngân sách hay mục tiêu tiết kiệm. ` +
        `Nếu người dùng muốn thay đổi dữ liệu tài chính, hãy tóm tắt đề xuất và yêu cầu xác nhận trước.`,
      inputAudioTranscription: {},
      outputAudioTranscription: {},
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: {
            voiceName: process.env.GEMINI_LIVE_VOICE || 'Kore',
          },
        },
      },
    };
  }

  connectLiveVoiceSession(params: LiveVoiceSessionParams): Promise<Session> {
    return this.genAI.live.connect({
      model: this.liveModel,
      config: this.getLiveVoiceConfig(params.userId, params.locale),
      callbacks: {
        onopen: params.onOpen,
        onmessage: params.onMessage,
        onerror: params.onError,
        onclose: params.onClose,
      },
    });
  }
}
