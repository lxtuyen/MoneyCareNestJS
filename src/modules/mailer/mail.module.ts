import { MailerModule } from '@nestjs-modules/mailer';
import { Module } from '@nestjs/common';
import { HandlebarsAdapter } from '@nestjs-modules/mailer/dist/adapters/handlebars.adapter';
import { existsSync } from 'fs';
import { join } from 'path';
import { MailService } from './mail.service';
import { ConfigModule, ConfigService } from '@nestjs/config';

@Module({
  imports: [
    MailerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const mailUser = configService.get<string>('MAIL_USER');
        const templateCandidates = [
          join(process.cwd(), 'src', 'modules', 'mailer', 'templates'),
          join(process.cwd(), 'dist', 'modules', 'mailer', 'templates'),
        ];
        const templateDir =
          templateCandidates.find((dir) => existsSync(dir)) ??
          templateCandidates[0];

        return {
          transport: {
            host: configService.get<string>('MAIL_HOST') ?? 'smtp.gmail.com',
            port: configService.get<number>('MAIL_PORT') ?? 587,
            secure: configService.get<string>('MAIL_SECURE') === 'true',
            auth: {
              user: mailUser,
              pass: configService.get<string>('MAIL_PASS'),
            },
          },
          defaults: {
            from:
              configService.get<string>('MAIL_FROM') ??
              (mailUser ? `"MoneyCare" <${mailUser}>` : undefined),
          },
          template: {
            dir: templateDir,
            adapter: new HandlebarsAdapter(),
            options: {
              strict: true,
            },
          },
        };
      },
    }),
  ],
  providers: [MailService],
  exports: [MailService],
})
export class MailModule {}
