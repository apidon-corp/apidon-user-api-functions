export type CollectibleTradeDocData = {
  createdCollectibles: CreatedCollectiblesArrayObject[];
  boughtCollectibles: BoughtCollectiblesArrayObject[];
  soldCollectibles: SoldCollectiblesArrayObject[];
};

export type BoughtCollectiblesArrayObject = {
  postDocPath: string;
  collectibleDocPath: string;
  ts: number;
};

export type SoldCollectiblesArrayObject = {
  postDocPath: string;
  collectibleDocPath: string;
  ts: number;
  username: string;
};

export type CreatedCollectiblesArrayObject = {
  postDocPath: string;
  collectibleDocPath: string;
  ts: number;
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
