export type PostServerData = {
  senderUsername: string;

  description: string;
  image: string;

  rates: RateData[];
  comments: CommentDataV2[];

  collectibleStatus:
    | {
        isCollectible: false;
      }
    | {
        isCollectible: true;
        collectibleDocPath: string;
      };

  creationTime: number;
  id: string;
};

export type PostServerDataV3 = {
  senderUsername: string;

  description: string;
  image: string;

  rates: RateData[];
  comments: CommentDataV2[];

  nftStatus: {
    convertedToNft: boolean;
    nftDocPath?: string;
  };

  creationTime: number;
  id: string;
};

export type RateData = {
  sender: string;
  rate: number;
  ts: number;
};

export type CommentDataV2 = {
  sender: string;
  message: string;
  ts: number;
};

export type CommentInteractionData = {
  postDocPath: string;
  creationTime: number;
};

export type UploadedPostArrayObject = {
  timestamp: number;
  postDocPath: string;
};

export type PostDocPathsArrayItem = {
  postDocPath: string;
  timestamp: number;
};

export type PostsDocData = {
  postDocPaths: PostDocPathsArrayItem[];
};
