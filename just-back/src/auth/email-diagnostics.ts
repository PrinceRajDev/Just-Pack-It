/** Fixed operational categories only. Never log provider bodies, recipient, key or OTP. */
export function emailFailureCategory(status: number, code?: unknown) {
  if (status === 401) return "authentication_or_ip_restriction";
  if (status === 402) return "credits_or_account_plan";
  if (status === 403) return "account_permission_or_activation";
  if (status === 429) return "provider_rate_limit";
  if (status >= 500) return "provider_unavailable";
  if (code === "invalid_parameter" || code === "missing_parameter") return "sender_or_request_configuration";
  return "provider_rejected_or_unconfirmed";
}
