export interface RequestContext {
  readonly correlationId: string;
}

export type Result<T, E extends Error = Error> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: E };
