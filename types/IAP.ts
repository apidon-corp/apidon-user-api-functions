export type RevenuCatNotificationType =
  | "TEST"
  | "INITIAL_PURCHASE"
  | "RENEWAL"
  | "CANCELLATION"
  | "UNCANCELLATION"
  | "NON_RENEWING_PURCHASE"
  | "SUBSCRIPTION_PAUSED"
  | "EXPIRATION"
  | "BILLING_ISSUE"
  | "PRODUCT_CHANGE"
  | "TRANSFER"
  | "SUBSCRIPTION_EXTENDED"
  | "TEMPORARY_ENTITLEMENT_GRANT";

export type CancelReason =
  | "UNSUBSCRIBE"
  | "BILLING_ERROR"
  | "DEVELOPER_INITIATED"
  | "PRICE_INCREASE"
  | "CUSTOMER_SUPPORT"
  | "UNKNOWN"
  | "SUBSCRIPTION_PAUSED";

export type RevenueCatNotificationPayload = {
  type: RevenuCatNotificationType;
  app_id: string;
  transaction_id: string;
  event_timestamp_ms: number;
  app_user_id: string;
  original_app_user_id: string;
  aliases: any[];
  subscriber_attributes: any[];
  product_id: string;
  price: number;
  price_in_purchased_currency: number;
  currency: string;
  period_type: string;
  purchased_at_ms: number;
  /** Only On Subscriptions */
  expiration_at_ms?: number;
  store: string;
  environment: string;
  cancel_reason?: CancelReason;
  expiration_reason: string;
  country_code: string;
  offer_code: string | null;
};

export type PaymentIntentTopUpDocData = {
  /**
   * The unique identifier for the payment intent, used to track and reference the transaction.
   */
  transactionId: string;

  /**
   * A boolean indicating whether the payment has been refunded (true if refunded, false otherwise).
   */
  refunded: boolean;

  /**
   * A boolean indicating whether the payment was successful (true if successful, false otherwise).
   */
  success: boolean;

  /**
   * The timestamp of when the payment intent was created, represented as a number (typically in milliseconds since epoch).
   */
  ts: number;

  /**
   * The username of the user making the payment, represented as a string.
   */
  username: string;

  /**
   * The item id of product that bought, represented as a string.
   */
  productId: string;

  price: number;
  priceInPurchasedCurrency: number;

  currency: string;
};

export type TopUpPlansConfigDocData = {
  activeTopUpProductIdS: string[];
};
