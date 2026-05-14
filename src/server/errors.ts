export interface HttpErrorBody {
  error: {
    code: string;
    message: string;
    hint?: string;
  };
}

export interface HttpErrorResult {
  statusCode: number;
  body: HttpErrorBody;
}

export class AppError extends Error {
  readonly code: string;
  readonly statusCode: number;
  readonly hint?: string;

  constructor(code: string, statusCode: number, message: string, hint?: string) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.statusCode = statusCode;
    this.hint = hint;
  }
}

export class NotFoundError extends AppError {
  constructor(entity: string, id: string) {
    super("not_found/" + entity, 404, `${entity} not found: ${id}`);
    this.name = "NotFoundError";
  }
}

export class ValidationError extends AppError {
  constructor(message: string, hint?: string) {
    super("validation/request", 400, message, hint);
    this.name = "ValidationError";
  }
}

export class StateError extends AppError {
  constructor(message: string, hint?: string) {
    super("state/invalid_transition", 409, message, hint);
    this.name = "StateError";
  }
}

export function toHttpError(err: unknown): HttpErrorResult {
  if (err instanceof AppError) {
    return {
      statusCode: err.statusCode,
      body: {
        error: {
          code: err.code,
          message: err.message,
          ...(err.hint !== undefined && { hint: err.hint }),
        },
      },
    };
  }

  const message = err instanceof Error ? err.message : "An unexpected error occurred";

  return {
    statusCode: 500,
    body: { error: { code: "internal/error", message } },
  };
}
