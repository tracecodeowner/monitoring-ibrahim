export function authorized(request: Request, passwordOverride?: string) {
  const expected = process.env.DASHBOARD_PASSWORD;
  if (!expected) return true;

  const supplied = passwordOverride ?? request.headers.get("x-dashboard-password") ?? "";
  return supplied === expected;
}

export function cronAuthorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}