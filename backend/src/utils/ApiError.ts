export class ApiError extends Error {
  readonly statusCode: number;
  readonly details: unknown;

  constructor(statusCode: number, message: string, details: unknown = null) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.details = details;
  }

  static badRequest(message = 'Yêu cầu không hợp lệ', details: unknown = null) {
    return new ApiError(400, message, details);
  }

  static unauthorized(message = 'Bạn cần đăng nhập') {
    return new ApiError(401, message);
  }

  static forbidden(message = 'Bạn không có quyền thực hiện thao tác này') {
    return new ApiError(403, message);
  }

  static notFound(message = 'Không tìm thấy dữ liệu') {
    return new ApiError(404, message);
  }

  static conflict(message: string) {
    return new ApiError(409, message);
  }

  static tooManyRequests(message: string) {
    return new ApiError(429, message);
  }
}
