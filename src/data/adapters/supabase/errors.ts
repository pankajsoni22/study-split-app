import type { PostgrestError } from '@supabase/supabase-js';
import { AppError } from '../../errors.ts';

/** Maps Supabase/PostgREST errors (including hints raised by our SQL functions) to AppError. */
export function toAppError(err: PostgrestError | Error | null | undefined): AppError {
  if (!err) return new AppError('UNKNOWN', 'Something went wrong');
  if (err instanceof AppError) return err;
  const message = err.message || 'Something went wrong';
  if (err instanceof TypeError || /Failed to fetch|NetworkError|Load failed/i.test(message)) {
    return new AppError('NETWORK', message);
  }
  const pg = err as Partial<PostgrestError>;
  if (pg.hint === 'UNAVAILABLE') return new AppError('UNAVAILABLE', message);
  if (pg.hint === 'RATE_LIMIT') return new AppError('RATE_LIMIT', message);
  if (pg.hint === 'CONFLICT') return new AppError('CONFLICT', message);
  if (pg.hint === 'SLUG_TAKEN') return new AppError('SLUG_TAKEN', message);
  if (pg.hint === 'TOO_LARGE') return new AppError('TOO_LARGE', message);
  if (pg.code === '42501') return new AppError('FORBIDDEN', message);
  if (pg.code === 'PGRST116' || pg.code === 'P0002') return new AppError('NOT_FOUND', message);
  if (pg.code === '28000') return new AppError('NOT_SIGNED_IN', message);
  return new AppError('UNKNOWN', message);
}

/** Unwraps a PostgREST result: returns data or throws an AppError. */
export function unwrap<T>(result: { data: T | null; error: PostgrestError | null }): T {
  if (result.error) throw toAppError(result.error);
  return result.data as T;
}
