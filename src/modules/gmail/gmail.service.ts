import { Injectable } from '@nestjs/common';
import axios, { AxiosResponse } from 'axios';
import {
  GmailMessageDetail,
  GmailMessagePart,
} from 'src/common/interfaces/gmail-message-detail.interface';
import {
  GmailListMessagesResponse,
  GmailMessageItem,
} from 'src/common/interfaces/gmail-message.interface';
import { GoogleOAuthRefreshResponse } from 'src/common/interfaces/google-oauth.interface';

@Injectable()
export class GmailService {
  async listVCBMessages(accessToken: string): Promise<GmailMessageItem[]> {
    const response: AxiosResponse<GmailListMessagesResponse> =
      await axios.get<GmailListMessagesResponse>(
        'https://gmail.googleapis.com/gmail/v1/users/me/messages',
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
          params: {
            q: `
            from:VCBDigibank@info.vietcombank.com.vn
          `,
            maxResults: 10,
          },
        },
      );
    return response.data.messages ?? [];
  }

  async getMessage(
    accessToken: string,
    messageId: string,
  ): Promise<GmailMessageDetail> {
    const response: AxiosResponse<GmailMessageDetail> =
      await axios.get<GmailMessageDetail>(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        },
      );
    return response.data;
  }

  private findPart(
    part: GmailMessagePart,
    mimeType: string,
  ): GmailMessagePart | undefined {
    if (part.mimeType === mimeType && part.body?.data) {
      return part;
    }

    if (part.parts) {
      for (const p of part.parts) {
        const found = this.findPart(p, mimeType);
        if (found) return found;
      }
    }

    return undefined;
  }

  decodeBody(payload: GmailMessagePart): string {
    const htmlPart = this.findPart(payload, 'text/html');
    const textPart = this.findPart(payload, 'text/plain');

    const part = htmlPart ?? textPart;
    if (!part?.body?.data) return '';

    let base64 = part.body.data.replace(/-/g, '+').replace(/_/g, '/');

    while (base64.length % 4 !== 0) {
      base64 += '=';
    }

    return Buffer.from(base64, 'base64').toString('utf8');
  }

  async refreshAccessToken(refreshToken: string): Promise<{
    accessToken: string;
    expiresAt: Date;
  }> {
    const response: AxiosResponse<GoogleOAuthRefreshResponse> =
      await axios.post<GoogleOAuthRefreshResponse>(
        'https://oauth2.googleapis.com/token',
        {
          client_id: process.env.GOOGLE_CLIENT_ID!,
          client_secret: process.env.GOOGLE_CLIENT_SECRET!,
          grant_type: 'refresh_token',
          refresh_token: refreshToken,
        },
      );

    const data = response.data;

    if (!data.access_token || !data.expires_in) {
      throw new Error('Invalid Google refresh token response');
    }

    return {
      accessToken: data.access_token,
      expiresAt: new Date(Date.now() + data.expires_in * 1000),
    };
  }
}
