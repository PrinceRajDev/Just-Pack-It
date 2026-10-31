export interface PublicPlatformSettings {
  supportEmail: string;
  supportPhone: string;
  supportHours: string;
  noticeEnabled: boolean;
  noticeText: string;
}
export interface PlatformSettings extends PublicPlatformSettings {
  version: number;
  updatedAt: string | null;
  configuration: {
    codEnabled: boolean;
    onlineEnabled: boolean;
    paymentMode: string;
    refundsEnabled: boolean;
    platformDeliveryEnabled: boolean;
    emailOtpRequired: boolean;
    emailConfigured: boolean;
    pushEnabled: boolean;
    imageProvider: string;
    imageConfigured: boolean;
    inventoryWorkerEnabled: boolean;
    paymentWorkerEnabled: boolean;
  };
}
