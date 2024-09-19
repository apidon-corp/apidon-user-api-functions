
/**
 * @deprecated
 */
export type BuyersArrayObject = {
  username: string;
  ts: number;
};

/**
 * @deprecated
 */
export type CollectibleDocDataOld = {
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
