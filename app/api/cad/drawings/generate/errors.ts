export interface DrawingGenerationFailure {
  message: string;
  status: number;
  code?: string;
}

export class DrawingGenerationError extends Error {
  readonly status: number;
  readonly code?: string;

  constructor(input: DrawingGenerationFailure) {
    super(input.message);
    this.status = input.status;
    this.code = input.code;
    this.name = "DrawingGenerationError";
  }
}

export function fail(input: DrawingGenerationFailure): never {
  throw new DrawingGenerationError(input);
}
