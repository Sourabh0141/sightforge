/* eslint-disable */
/**
 * Auto-generated from defaults.schema.json. Do not edit manually.
 */

/**
 * Unified operational defaults and plan constraints per R78
 */
export interface SightForgeDefaultsConfig {
  auth: {
    accessTokenTtlSeconds: number;
    refreshTokenTtlDays: number;
    argon2id: {
      memoryKiB: number;
      iterations: number;
      parallelism: number;
      version: string;
    };
  };
  media: {
    maxImageSizeBytes: number;
    maxVideoSizeBytes: number;
    maxVideoDurationSeconds: number;
    maxImageDimensionPixels: number;
    maxImageTotalPixels: number;
    allowedImageMimeTypes: string[];
    allowedVideoMimeTypes: string[];
  };
  video: {
    defaultPerFrameSamplingFps: number;
    minPerFrameSamplingFps: number;
    maxPerFrameSamplingFps: number;
    maxTrackingFps: number;
  };
  retention: {
    completedInputMediaDays: number;
    failedInputMediaDays: number;
    completedResultsDays: number;
    multipartUploadExpiryDays: number;
  };
  quotas: {
    defaultUserDailyJobsQuota: number;
    authLockoutMaxAttempts: number;
    authLockoutWindowSeconds: number;
    monthlySpendWarningUsd: number;
    monthlySpendCriticalUsd: number;
  };
  models: {
    defaultVariant: string;
    availableVariants: string[];
    defaultVariantPerTask: {
      [k: string]: string;
    };
    coldStartBudgetSeconds: number;
  };
  freePlanCeilings: {
    workerCpuPerInvocationMs: number;
    workerRequestsPerDay: number;
    subrequestsPerInvocation: number;
    cronTriggers: number;
    maxScriptGzipBytes: number;
    d1ReadsPerDay: number;
    d1WritesPerDay: number;
    d1StorageBytes: number;
    queueOperationsPerDay: number;
    r2StorageBytes: number;
    durableObjectRequestsPerDay: number;
    durableObjectDurationGbSecondsPerDay: number;
  };
}
