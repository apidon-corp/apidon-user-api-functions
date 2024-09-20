export type CollectibleDocData = {
  id: string;
  creator: string;
  timestamp: number;
  postDocPath: string;
  price: {
    price: number;
    currency: "USD";
  };
  stock: {
    initialStock: number;
    remainingStock: number;
  };
};

export type CollectorDocData = {
  username: string;
  timestamp: number;
};
