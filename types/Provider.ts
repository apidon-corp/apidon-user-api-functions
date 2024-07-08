export type CurrentProviderDocData = {
  providerId: string;
  startTime: number;
  offer: number;
  clientId: string;
};

export type OldProviderDocData = {
  providerId: string;
  startTime: number;
  offer: number;
  endTime: number;
  totalProfit: number;
  clientId: string;
};

export type RatingsDocData = {
  ratings: Rating[];
};

export type Rating = {
  providerId: string;
  score: number;
};
