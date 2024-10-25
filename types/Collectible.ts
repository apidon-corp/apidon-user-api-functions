export type CollectibleDocData =
  | {
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
      type: "trade";
    }
  | {
      id: string;
      creator: string;
      timestamp: number;
      postDocPath: string;
      stock: {
        initialStock: number;
        remainingStock: number;
      };
      type: "event";
    };

export type CollectorDocData = {
  username: string;
  timestamp: number;
};

export type CollectibleType = "trade" | "event";

export type CodeDocData =
  | {
      code: string;
      collectibleDocPath: string;
      creationTime: number;
      creatorUsername: string;
      postDocPath: string;
      isConsumed: false;
    }
  | {
      code: string;
      collectibleDocPath: string;
      creationTime: number;
      creatorUsername: string;
      postDocPath: string;
      isConsumed: true;
      consumerUsername: string;
      consumedTime: number;
    };
