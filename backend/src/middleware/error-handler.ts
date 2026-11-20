import type { NextFunction, Request, Response } from "express";
import { logger } from "../utils/logger";
import { ApiError } from "../utils/api-error";

interface PostgresErrorLike {
  code?: string;
  constraint?: string;
  detail?: string;
}

function translatePostgresError(error: PostgresErrorLike): ApiError | null {
  switch (error.code) {
    case "23505":
      return new ApiError(409, "DUPLICATE_RECORD", "A record with this value already exists.", {
        constraint: error.constraint,
      });
    case "23503":
      return new ApiError(
        409,
        "REFERENCE_CONFLICT",
        "This record is referenced by other business data and cannot be changed.",
        { constraint: error.constraint },
      );
    case "23514":
      return new ApiError(422, "CONSTRAINT_VIOLATION", "The data violates a business rule.", {
        constraint: error.constraint,
      });
    case "22P02":
      return new ApiError(400, "INVALID_INPUT", "One of the provided values has an invalid format.");
    case "57014":
      return new ApiError(503, "QUERY_TIMEOUT", "The database query timed out. Please try again.");
    case "40001":
    case "40P01":
      return new ApiError(409, "CONCURRENT_UPDATE", "The record changed concurrently. Please retry.");
    case "ECONNREFUSED":
    case "ETIMEDOUT":
      return new ApiError(503, "DATABASE_UNAVAILABLE", "The database is temporarily unavailable.");
    default:
      return null;
  }
}

export function notFoundHandler(req: Request, _res: Response, next: NextFunction): void {
  next(new ApiError(404, "ROUTE_NOT_FOUND", `Route ${req.method} ${req.path} was not found.`));
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(
  error: unknown,
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (res.headersSent) return;

  let apiError: ApiError;

  if (error instanceof ApiError) {
    apiError = error;
  } else if (typeof error === "object" && error !== null && "type" in error) {
    apiError =
      (error as { type?: string }).type === "entity.too.large"
        ? new ApiError(413, "PAYLOAD_TOO_LARGE", "The request body is too large.")
        : new ApiError(400, "INVALID_REQUEST", "The request could not be processed.");
  } else if (typeof error === "object" && error !== null && "code" in error) {
    apiError =
      translatePostgresError(error as PostgresErrorLike) ??
      new ApiError(500, "INTERNAL_ERROR", "An unexpected error occurred.", undefined, false);
  } else if (error instanceof SyntaxError) {
    apiError = new ApiError(400, "INVALID_JSON", "The request body is not valid JSON.");
  } else {
    apiError = new ApiError(500, "INTERNAL_ERROR", "An unexpected error occurred.", undefined, false);
  }

  if (apiError.statusCode >= 500) {
    logger.error("Unhandled API error", {
      requestId: req.requestId,
      method: req.method,
      path: req.path,
      status: apiError.statusCode,
      code: apiError.code,
      error,
    });
  }

  // AI failures are operational and their messages are written for end users,
  // so they stay visible even when the status code is 5xx.
  const exposeMessage = apiError.expose || apiError.code.startsWith("AI_");

  res.status(apiError.statusCode).json({
    success: false,
    error: {
      code: apiError.code,
      message: exposeMessage ? apiError.message : "An unexpected error occurred.",
      ...(exposeMessage && apiError.details !== undefined ? { details: apiError.details } : {}),
    },
    requestId: req.requestId,
  });
}
