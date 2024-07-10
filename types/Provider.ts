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

export type PostUploadActionRequestBody = {
  postDocPath: string;
  imageURL: string;
  username: string;
  providerId: string;
  clientId: string;
};

export type ProviderShowcaseItem = {
  name: string;
  description: string;
  image: string;

  score: number;
  clientCount: number;

  offer: number;
};

export type ActiveProviderInformation = {
  name: string;
  description: string;
  image: string;
  clientCount: number;
  score: number;
  userScore: number;
  offer: number;
  startTime: number;
};

export type ProviderInformation = {
  isThereActiveProvider: boolean;

  /**
   * If user has no provider, we will send provider options to make him-her choose.
   */
  providerOptions?: ProviderShowcaseItem[];

  activeProviderInformation?: ActiveProviderInformation;
};

export type InteractedPostObject = {
  creationTime: number;
  postDocPath: string;
};

