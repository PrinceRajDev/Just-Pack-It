import type { ErrorRequestHandler } from "express";
import { ZodError } from "zod";
import mongoose from "mongoose";
export class AppError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}
export function fail(status: number, code: string, message: string): never {
  throw new AppError(status, code, message);
}
export const errorHandler: ErrorRequestHandler = (
  error: unknown,
  req,
  res,
  _next,
) => {
  let status = 500,
    code = "INTERNAL_ERROR",
    message = "Unexpected server error";
  let fields: string[] | undefined;
  if (error instanceof AppError) ({ status, code, message } = error);
  else if (error instanceof ZodError) {
    status = 400;
    code = "VALIDATION_ERROR";
    message = "Invalid request";
    fields = error.issues.map((i) => i.path.join("."));
  } else if (error instanceof mongoose.Error.VersionError) {
    status = 409;
    code = "VERSION_CONFLICT";
    message = "Record changed; reload and retry";
  } else if (
    error instanceof mongoose.Error.ValidationError ||
    error instanceof mongoose.Error.CastError
  ) {
    status = 400;
    code = "VALIDATION_ERROR";
    message = "Invalid data";
  } else if (
    typeof error === "object" &&
    error &&
    "code" in error &&
    error.code === 11000
  ) {
    status = 409;
    code = "DUPLICATE";
    message = "A record with this identifier already exists";
  } else if (
    typeof error === "object" &&
    error &&
    "type" in error &&
    error.type === "entity.too.large"
  ) {
    status = 413;
    code = "BODY_TOO_LARGE";
    message = "Request body too large";
  } else if (
    typeof error === "object" &&
    error &&
    "code" in error &&
    error.code === 50
  ) {
    status = 503;
    code = "QUERY_TIMEOUT";
    message = "Catalogue query timed out; narrow your search and retry";
  } else if (error instanceof SyntaxError) {
    status = 400;
    code = "INVALID_JSON";
    message = "Invalid JSON body";
  }
  res.locals.errorCode = code;
  res.status(status).json({
    message,
    code,
    requestId: res.locals.requestId,
    ...(fields ? { fields } : {}),
  });
};
