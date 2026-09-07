export const MAIL_LIMIT = 300;
export const MAIL_WINDOW_MS = 24 * 60 * 60 * 1000;
export const AUTOMATIC_SEND_DESCRIPTION = "Automatisk kørsel én gang dagligt kl. 16–17 UTC: kl. 18–19 dansk sommertid / 17–18 vintertid. Det valgte tidspunkt er tidligst mulig afsendelse. Kø og ledig mailkvote kan udskyde afsendelsen.";

export function mailLimit(value = process.env.MAIL_DAILY_LIMIT) {
  const limit = Number(value ?? MAIL_LIMIT);
  return Number.isInteger(limit) && limit >= 0 ? Math.min(limit, MAIL_LIMIT) : MAIL_LIMIT;
}

export function automaticSendWindow(notBefore: Date) {
  const start = new Date(notBefore);
  start.setUTCHours(16, 0, 0, 0);
  // Never promise the current day's invocation when its start has already passed.
  if (start < notBefore) start.setUTCDate(start.getUTCDate() + 1);
  return { start, end: new Date(start.getTime() + 60 * 60 * 1000) };
}

export function hasAutomaticSendWindow(sendAt: Date, closesAt: Date, now = new Date()) {
  return closesAt > automaticSendWindow(new Date(Math.max(sendAt.getTime(), now.getTime()))).end;
}

export function mailFailure(status: number, code: unknown) {
  if (code === "not_enough_credits" || status === 402) return { retryable: true, quotaBlocked: true };
  if (status === 401 || status === 403 || code === "account_under_validation") return { retryable: true, accountBlocked: true };
  // A server/network failure may have occurred AFTER acceptance. Do not blindly resend.
  if (status >= 500 || code === "duplicate_request" || code === "duplicate_parameter") return { retryable: false, uncertain: true };
  return { retryable: status === 429 };
}
