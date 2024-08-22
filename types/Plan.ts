export interface PlanDocData {
  storeProductId: string;
  title: string;
  collectible: {
    undo: boolean;
    upToFive: boolean;
    upToTen: boolean;
    upToFifthy: boolean;
    upToHundred: boolean;
  };
  stock: {
    allowCollectingSoldOut: boolean;
    upToTen: boolean;
    upToFifty: boolean;
    upToHundred: boolean;
    upToThousand: boolean;
  };
  support: {
    priority: boolean;
  };
  price: {
    price: number;
    currency: string;
  };
}

export function calculateStockLimit(stockData: PlanDocData["stock"]) {
  let stockLimit = 0;

  if (stockData.upToTen) stockLimit = 10;
  if (stockData.upToFifty) stockLimit = 50;
  if (stockData.upToHundred) stockLimit = 100;
  if (stockData.upToThousand) stockLimit = 1000;

  return stockLimit;
}
