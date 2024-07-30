export type BuyersArrayObject = {
  username: string;
  ts: number;
};

export type CollectibleDocData = {
  id: string;
  creator: string;
  timestamp: number;
  postDocPath: string;
  buyers: BuyersArrayObject[];
  price: {
    price: number;
    currency: "USD";
  };
  stock: {
    initialStock: number;
    remainingStock: number;
  };
};
