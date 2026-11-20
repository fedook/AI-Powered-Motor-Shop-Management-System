export class ApiError extends Error {
  readonly statusCode: number;
  readonly code: string;
  readonly details?: unknown;
  readonly expose: boolean;

  constructor(
    statusCode: number,
    code: string,
    message: string,
    details?: unknown,
    expose = statusCode < 500,
  ) {
    super(message);
    this.name = "ApiError";
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.expose = expose;
    Error.captureStackTrace?.(this, ApiError);
  }

  static badRequest(message: string, details?: unknown) {
    return new ApiError(400, "BAD_REQUEST", message, details);
  }

  static unauthorized(message = "Authentication is required.") {
    return new ApiError(401, "UNAUTHORIZED", message);
  }

  static forbidden(message = "You do not have permission to perform this action.") {
    return new ApiError(403, "FORBIDDEN", message);
  }

  static notFound(message = "Resource not found.") {
    return new ApiError(404, "NOT_FOUND", message);
  }

  static conflict(message: string, details?: unknown) {
    return new ApiError(409, "CONFLICT", message, details);
  }

  static unprocessable(message: string, details?: unknown) {
    return new ApiError(422, "UNPROCESSABLE_ENTITY", message, details);
  }

  static tooManyRequests(message = "Too many requests. Please try again later.") {
    return new ApiError(429, "TOO_MANY_REQUESTS", message);
  }

  static serviceUnavailable(message: string, details?: unknown) {
    return new ApiError(503, "SERVICE_UNAVAILABLE", message, details);
  }
}
