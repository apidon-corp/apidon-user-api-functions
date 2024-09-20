export type CreatedCollectibleDocData = {
  postDocPath: string;
  collectibleDocPath: string;
  ts: number;
};

export type BoughtCollectibleDocData = {
  postDocPath: string;
  collectibleDocPath: string;
  ts: number;
};

export type SoldCollectibleDocData = {
  postDocPath: string;
  collectibleDocPath: string;
  ts: number;
  username: string;
};

export type PurhcasePaymentIntentDocData = {
  id: string;
  ts: number;
  postDocPath: string;
  collectibleDocPath: string;
  price: number;
  currency: "USD";
  refunded: boolean;
  seller: string;
};

export type SellPaymentIntentDocData = {
  id: string;
  ts: number;
  postDocPath: string;
  collectibleDocPath: string;
  price: number;
  currency: "USD";
  refunded: boolean;
  customer: string;
};
