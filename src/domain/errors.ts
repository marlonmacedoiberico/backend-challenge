export type ApplicationErrorCode = 'validation' | 'not_found' | 'conflict';

export class ApplicationError extends Error {
  constructor(
    public readonly code: ApplicationErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'ApplicationError';
  }
}

export function validation(message: string): never {
  throw new ApplicationError('validation', message);
}

export function notFound(message: string): never {
  throw new ApplicationError('not_found', message);
}

export function conflict(message: string): never {
  throw new ApplicationError('conflict', message);
}
