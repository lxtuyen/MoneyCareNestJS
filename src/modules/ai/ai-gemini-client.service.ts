import { Injectable } from '@nestjs/common';
import { GenerateContentConfig, GoogleGenAI } from '@google/genai';

const DEFAULT_MODEL = 'gemini-2.5-flash-lite';

@Injectable()
export class AiGeminiClientService {
  private readonly genAI: GoogleGenAI;
  readonly chatModel: string;
  readonly parseModel: string;
  readonly analysisModel: string;

  constructor() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error('Missing GEMINI_API_KEY in environment variables');
    }
    this.genAI = new GoogleGenAI({ apiKey });
    this.chatModel = process.env.GEMINI_CHAT_MODEL || DEFAULT_MODEL;
    this.parseModel = process.env.GEMINI_PARSE_MODEL || this.chatModel;
    this.analysisModel = process.env.GEMINI_ANALYSIS_MODEL || this.chatModel;
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
}
