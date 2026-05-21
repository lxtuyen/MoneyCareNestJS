import { HttpStatus } from '@nestjs/common';
import { ApiResponse } from '../dto/api-response.dto';

/**
 * Phản hồi thành công chuẩn với mã 200 OK
 * @param data Dữ liệu phản hồi
 * @param message Thông điệp tùy chọn kèm theo
 */
export function ok<T>(data: T, message?: string): ApiResponse<T> {
  return new ApiResponse<T>({
    success: true,
    statusCode: HttpStatus.OK,
    data,
    message,
  });
}

/**
 * Phản hồi thành công chuẩn với mã 201 Created (Đã tạo mới)
 * @param data Dữ liệu phản hồi
 * @param message Thông điệp tùy chọn kèm theo
 */
export function created<T>(data: T, message?: string): ApiResponse<T> {
  return new ApiResponse<T>({
    success: true,
    statusCode: HttpStatus.CREATED,
    data,
    message,
  });
}
