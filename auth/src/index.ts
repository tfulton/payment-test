import type { RequestContext, Result } from "@payment-test/common";

export interface AuthSession {
  readonly accessToken: string;
  readonly context: RequestContext;
}

export function authenticate(session: AuthSession): Result<AuthSession> {
  return { ok: true, value: session };
}
