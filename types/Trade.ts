export type NFTTradeDocData = {
  createdNFTs: CreatedNFTsArrayObject[];
  boughtNFTs: BoughtNFTsArrayObject[];
  soldNFTs: SoldNFTsArrayObject[];
  stripeCustomerId?: string;
};

export type BoughtNFTsArrayObject = {
  postDocPath: string;
  nftDocPath: string;
  ts: number;
};

export type SoldNFTsArrayObject = {
  postDocPath: string;
  nftDocPath: string;
  ts: number;
  username: string;
};

export type CreatedNFTsArrayObject = {
  postDocPath: string;
  nftDocPath: string;
  ts: number;
};

export type PurhcasePaymentIntentDocData = {
  id: string;
  ts: number;
  postDocPath: string;
  nftDocPath: string;
  price: number;
  currency: "USD";
  refunded: boolean;
  seller: string,
};

export type SellPaymentIntentDocData = {
  id: string;
  ts: number;
  postDocPath: string;
  nftDocPath: string;
  price: number;
  currency: "USD";
  refunded: boolean;
  customer: string;
};
