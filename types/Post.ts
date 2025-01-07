import { ReviewStatus } from "./Admin";

/**
 * @deprecated
 */
export type PostServerDataOld = {
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

/**
 * @deprecated
 */
export type PostDataOnMainPostsCollectionOld = {
  postDocPath: string;
  sender: string;
  timestamp: number;
  reportCount: number;
};

export type ReportDocData = {
  username: string;
  ts: number;
};

export type NewPostDocData = {
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

  timestamp: number;
  id: string;

  reviewStatus: ReviewStatus;

  postDocPath: string;

  reportCount: number;
};

export type PostMigrateStructure = {
  newPostDocData: NewPostDocData;
  rates: RatingData[];
  comments: CommentServerData[];
};
