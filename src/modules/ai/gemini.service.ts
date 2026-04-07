import { Injectable, Logger } from '@nestjs/common';
import { GoogleGenAI } from '@google/genai';

@Injectable()
export class GeminiService {
  private readonly logger = new Logger(GeminiService.name);
  private readonly genAI: GoogleGenAI;

  constructor() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error('Thiếu GEMINI_API_KEY trong biến môi trường');
    }
    this.genAI = new GoogleGenAI({ apiKey });
  }

  get model() {
    return this.genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
  }

  async generateContent(prompt: string, image?: Buffer, mimeType?: string) {
    if (image && mimeType) {
      return this.model.generateContent([
        prompt,
        {
          inlineData: {
            data: image.toString('base64'),
            mimeType: mimeType,
          },
        },
      ]);
    }
    return this.model.generateContent(prompt);
  }
}
