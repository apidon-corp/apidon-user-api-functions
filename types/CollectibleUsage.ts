import {SubscriptionProductIds} from "./Subscriptions";

export type CollectibleUsageDocData = {
  planId: SubscriptionProductIds | "free";
  subscriptionDocPath: string;
  limit: number;
  used: number;
};
