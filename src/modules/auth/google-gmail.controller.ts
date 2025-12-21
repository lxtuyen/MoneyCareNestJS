import { Controller, Get, Param, Query, Res } from '@nestjs/common';
import { AuthService } from './auth.service';
import type { Response } from 'express';

@Controller('auth/google/gmail')
export class GoogleGmailController {
  constructor(private readonly authService: AuthService) {}
/*
  @Get('connect/:userId')
  connect(
    @Res() res: Response,
    @Param('userId') userId: number,
    @Query('platform') platform: 'web' | 'mobile',
  ) {
    const state = JSON.stringify({
      userId: userId,
      platform,
    });

    const params = new URLSearchParams({
      client_id: process.env.CLIENT_ID!,
      redirect_uri: process.env.REDIRECT_URI!,
      response_type: 'code',
      scope: 'https://www.googleapis.com/auth/gmail.readonly',
      access_type: 'offline',
      prompt: 'consent',
      state,
    });

    return res.redirect(
      `https://accounts.google.com/o/oauth2/v2/auth?${params}`,
    );
  }

  @Get('callback')
  async callback(
    @Query('code') code: string,
    @Query('state') rawState: string,
    @Res() res: Response,
  ) {
    const { userId, platform } = JSON.parse(rawState);

    await this.authService.exchangeCode(userId, code);

    if (platform === 'web') {
      return res.redirect('https://your-fe-domain/?gmail=connected');
    }

    return res.redirect('moneycare://gmail-connected');
  }*/
}
