import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v2 as cloudinary, UploadApiResponse, UploadApiErrorResponse } from 'cloudinary';
import { Readable } from 'stream';

@Injectable()
export class CloudinaryService {
  private readonly logger = new Logger(CloudinaryService.name);

  constructor(private readonly configService: ConfigService) {
    cloudinary.config({
      cloud_name: this.configService.get<string>('CLOUDINARY_CLOUD_NAME'),
      api_key: this.configService.get<string>('CLOUDINARY_API_KEY'),
      api_secret: this.configService.get<string>('CLOUDINARY_API_SECRET'),
    });
    this.logger.log('Cloudinary service initialized');
  }

  async uploadFile(
    file: Express.Multer.File,
  ): Promise<UploadApiResponse> {
    return new Promise((resolve, reject) => {
      const upload = cloudinary.uploader.upload_stream(
        {
          folder: 'money_care_couples',
        },
        (error, result) => {
          if (error) {
            this.logger.error('Error uploading file to Cloudinary:', error);
            return reject(error);
          }
          if (!result) {
            return reject(new Error('Cloudinary upload returned empty result'));
          }
          resolve(result);
        },
      );

      // Convert file buffer into readable stream and pipe to Cloudinary upload stream
      const stream = new Readable();
      stream.push(file.buffer);
      stream.push(null);
      stream.pipe(upload);
    });
  }
}
