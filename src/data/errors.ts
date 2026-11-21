// One error type for the whole app, whatever the backend. Adapters translate vendor errors into this.
export type AppErrorCode =
  | 'UNAVAILABLE'      // e.g. username taken/reserved
  | 'RATE_LIMIT'       // e.g. username changed < 30 days ago
  | 'CONFLICT'         // draft saved elsewhere since we loaded it
  | 'SLUG_TAKEN'
  | 'TOO_LARGE'
  | 'FORBIDDEN'        // RLS / role check refused
  | 'NOT_FOUND'
  | 'NETWORK'
  | 'NOT_SIGNED_IN'
  | 'UNKNOWN';

export class AppError extends Error {
  readonly code: AppErrorCode;
  constructor(code: AppErrorCode, message: string) {
    super(message);
    this.name = 'AppError';
    this.code = code;
  }
  static is(err: unknown, code?: AppErrorCode): err is AppError {
    return err instanceof AppError && (code === undefined || err.code === code);
  }
}

export function errorMessage(err: unknown): string {
  if (AppError.is(err, 'NETWORK')) return "Can't reach the server. Check your connection and try again.";
  return err instanceof Error ? err.message : 'Something went wrong';
}
