export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public details?: unknown) {
    super(message); this.name = 'ApiError';
  }
}
export function requireThat(condition: unknown, message: string): asserts condition {
  if (!condition) throw new ApiError(400, 'VALIDATION_ERROR', message);
}
