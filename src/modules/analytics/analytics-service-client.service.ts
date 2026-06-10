import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AnalyticsAnalyzeRequestPayload } from './types/analytics-payload.type';
import { AnalyticsServiceResponse } from './types/analytics-service-response.type';

@Injectable()
export class AnalyticsServiceClient {
  private readonly logger = new Logger(AnalyticsServiceClient.name);

  constructor(private readonly configService: ConfigService) {}

  /**
   * Gọi FastAPI analytics service để phân tích tài chính.
   */
  async analyzeFinancial(
    requestData: AnalyticsAnalyzeRequestPayload,
  ): Promise<AnalyticsServiceResponse> {
    const url =
      this.configService.get<string>('ANALYTICS_SERVICE_URL') ||
      'http://localhost:8000';
    const apiKey =
      this.configService.get<string>('ANALYTICS_SERVICE_API_KEY') || '';
    const timeoutMs = Number(
      this.configService.get<number>('ANALYTICS_SERVICE_TIMEOUT_MS') || 5000,
    );

    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      controller.abort();
      this.logger.warn(
        `FastAPI analytics request timed out after ${timeoutMs}ms`,
      );
    }, timeoutMs);

    try {
      this.logger.log(`Calling FastAPI at: ${url}/v1/financial/analyze`);

      const response = await fetch(`${url}/v1/financial/analyze`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': apiKey,
        },
        body: JSON.stringify(requestData),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        const truncated = this.truncateErrorBody(errorText);
        throw new Error(
          `HTTP error! status: ${response.status}, body=${truncated}`,
        );
      }

      const data = (await response.json()) as AnalyticsServiceResponse;
      this.logger.log(
        `FastAPI analytics responded successfully (status=${response.status})`,
      );
      return data;
    } catch (error) {
      clearTimeout(timeoutId);

      if (error.name === 'AbortError') {
        throw new Error(
          `Analytics service request timed out after ${timeoutMs}ms`,
        );
      }

      this.logger.error(
        `Error calling FastAPI analytics: ${error.message}`,
      );
      throw error;
    }
  }

  /**
   * Cắt ngắn body lỗi để tránh log quá dài.
   */
  private truncateErrorBody(body: string, maxLength = 500): string {
    if (body.length <= maxLength) {
      return body;
    }
    return body.substring(0, maxLength) + '...(truncated)';
  }
}
