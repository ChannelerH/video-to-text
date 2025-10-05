export type ApiResponse<Data = unknown> = {
  success?: boolean;
  message?: string;
  error?: string;
  code?: string | number;
  data?: Data;
  [key: string]: unknown;
};

export type AsyncTranscriptionResponse = ApiResponse<{
  job_id?: string;
  taskId?: string;
}> & {
  taskId?: string;
};

export type RefundEligibilityResponse = {
  eligible?: boolean;
  daysSinceStart?: number;
  minutesUsed?: number;
  transcriptionCount?: number;
  refundAmount?: number;
  currency?: string;
  reason?: string;
};

export type SubscriptionStatusResponse = ApiResponse<{
  url?: string;
  checkout_url?: string;
}>;

export type UsageLimitResponse = {
  limit?: number;
  used?: number;
  isDaily?: boolean;
  error?: string;
};
