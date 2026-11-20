import type { NextFunction, Request, Response } from "express";
import { ZodError, type ZodType } from "zod";
import { ApiError } from "../utils/api-error";

interface RequestSchemas {
  body?: ZodType;
  query?: ZodType;
  params?: ZodType;
}

/**
 * Validates and replaces request input with the parsed result. Unknown keys are
 * stripped by the schemas, so unvalidated fields never reach controllers.
 */
export function validate(schemas: RequestSchemas) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      if (schemas.body) req.body = schemas.body.parse(req.body);
      if (schemas.query) req.query = schemas.query.parse(req.query) as Request["query"];
      if (schemas.params) req.params = schemas.params.parse(req.params) as Request["params"];
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        next(
          new ApiError(
            422,
            "VALIDATION_ERROR",
            "Request validation failed.",
            error.issues.map((issue) => ({
              field: issue.path.join(".") || "request",
              message: issue.message,
              code: issue.code,
            })),
          ),
        );
        return;
      }
      next(error);
    }
  };
}
