export type SubscriptionDocData = {
  isActive: boolean;
  productId: string;
  periodType: string;
  purchasedTs: number;
  expirationTs: number;
  store: string;
  environment: string;
  // Only On Cancel Events
  cancellationReason?: string;
  // Only on Expiration Events
  expirationReason?: string;
  price: number;
  currency: string;
  priceInPurchasedCurrency: number;
  transactionId: string;
  countryCode: string;
  offerCode: string;
  customerId: string;
  ts: number;
};
