export interface RecoveryStatus {
  lastCheckedAt: string | null;
  nextCheckAt: string | null;
  failures: number;
  manualReview: boolean;
  code: string | null;
}
