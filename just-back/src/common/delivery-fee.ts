export const PLATFORM_DELIVERY_FEE_CENTS = 3000;
export function deliveryFeeCents(method: string, shopFee?: number): number | undefined {
  return method === "platform_delivery" ? PLATFORM_DELIVERY_FEE_CENTS : method === "pickup" ? 0 : shopFee;
}
