import { api } from "@/lib/api/client";
import type { Session } from "@/domain/types";
import type { SellerSignupInput, SignupEmailProof } from "@/domain/management";
export interface AccountProfile {
  name: string;
  phone: string;
  email?: string;
  emailVerified: boolean;
  version: number;
}
export const authentication = {
  google: (idToken: string, phone?: string, password?: string) =>
    api<Session>("/auth/google", {
      method: "POST",
      body: JSON.stringify({ idToken, phone, password }),
    }),
  profile: () => api<AccountProfile>("/auth/profile"),
  updateProfile: (name: string, version: number) =>
    api<AccountProfile>("/auth/profile", {
      method: "PATCH",
      body: JSON.stringify({ name, version }),
    }),
  requestPasswordReset: (email: string) =>
    api<{ challengeId: string; expiresAt: string; resendAfterSeconds: number }>(
      "/auth/password-recovery/request",
      { method: "POST", body: JSON.stringify({ email }) },
    ),
  resetPassword: (input: {
    email: string;
    emailChallengeId: string;
    emailOtp: string;
    newPassword: string;
  }) => api<void>("/auth/password-recovery/reset", { method: "POST", body: JSON.stringify(input) }),
  registrationOptions: () =>
    api<{ emailOtpRequired: boolean; emailOtpAvailable: boolean; googleSignInAvailable?: boolean }>(
      "/auth/registration-options",
    ),
  sendEmailOtp: (email: string) =>
    api<{ challengeId: string; expiresAt: string; resendAfterSeconds: number }>(
      "/auth/email-otp/send",
      { method: "POST", body: JSON.stringify({ email }) },
    ),
  registerDelivery: (name: string, phone: string, password: string, proof?: SignupEmailProof) =>
    api<Session>("/auth/register/delivery", {
      method: "POST",
      body: JSON.stringify({ name, phone, password, ...proof }),
    }),
  registerSeller: (input: SellerSignupInput) =>
    api<Session>("/auth/register/seller", { method: "POST", body: JSON.stringify(input) }),
  login: (phone: string, password: string) =>
    api<Session>("/auth/login", { method: "POST", body: JSON.stringify({ phone, password }) }),
  register: (name: string, phone: string, password: string, proof?: SignupEmailProof) =>
    api<Session>("/auth/register", {
      method: "POST",
      body: JSON.stringify({ name, phone, password, ...proof }),
    }),
  me: () => api<Omit<Session, "token">>("/auth/me"),
  logout: () => api<void>("/auth/logout", { method: "POST" }),
  changePassword: (currentPassword: string, newPassword: string) =>
    api<void>("/auth/password", {
      method: "POST",
      body: JSON.stringify({ currentPassword, newPassword }),
      signal: AbortSignal.timeout(30_000),
    }),
  logoutAll: (currentPassword: string) =>
    api<void>("/auth/logout-all", {
      method: "POST",
      body: JSON.stringify({ currentPassword }),
      signal: AbortSignal.timeout(30_000),
    }),
};
export function safeRedirect(value: string | undefined, fallback: string) {
  if (
    !value ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.includes("\\") ||
    /[\r\n]/.test(value)
  )
    return fallback;
  return value;
}
