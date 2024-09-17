import { ReviewStatus } from "./Admin";

/**
 * @deprecated
 */
export type PostServerDataOld = {
  senderUsername: string;

  description: string;
  image: string;

  rates: RateData[];
  comments: CommentServerData[];

  commentCount: number;

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

  reviewStatus?: ReviewStatus;
};

export type PostServerData = {
  senderUsername: string;

  description: string;
  image: string;

  ratingCount: number;
  ratingSum: number;

  commentCount: number;

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

  reviewStatus: ReviewStatus;
};

export type RateData = {
  sender: string;
  rate: number;
  ts: number;
};

export type RatingData = {
  sender: string;
  rating: number;
  timestamp: number;
};

export type CommentServerData = {
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
