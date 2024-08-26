export interface PlanDocData {
  storeProductId: string;
  title: string;
  collectible: {
    upToFive: boolean;
    upToTen: boolean;
    upToFifthy: boolean;
    upToHundred: boolean;
  };
  stock: {
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

export function calculateCollectibleLimit(collectibleData: PlanDocData["collectible"]) {
  let limit = 0;

  if (collectibleData.upToFive) limit = 5;
  if (collectibleData.upToTen) limit = 10;
  if (collectibleData.upToFifthy) limit = 50;
  if (collectibleData.upToHundred) limit = 100;

  return limit;
}
