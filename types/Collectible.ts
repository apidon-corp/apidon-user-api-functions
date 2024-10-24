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
      isConsumed: false;
      postDocPath: string;
    }
  | {
      code: string;
      collectibleDocPath: string;
      consumedTime: number;
      consumerUsername: string;
      creationTime: number;
      creatorUsername: string;
      isConsumed: true;
      postDocPath: string;
    };
