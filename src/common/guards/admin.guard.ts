import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { JwtPayload } from '../interfaces/jwt-payload.interface';

/**
 * Guard kiểm tra user có role ADMIN.
 * Phải dùng sau JwtAuthGuard: @UseGuards(JwtAuthGuard, AdminGuard)
 */
@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user = request.user as JwtPayload;

    if (!user || user.role !== 'admin') {
      throw new ForbiddenException(
        'Bạn không có quyền truy cập tài nguyên này.',
      );
    }

    return true;
  }
}
