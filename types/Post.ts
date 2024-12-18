import {ReviewStatus} from "./Admin";

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

/**
 * @deprecated
 */
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


export type PostDataOnMainPostsCollection = {
  postDocPath: string;
  sender: string;
  timestamp: number;
  reportCount: number;
};

export type ReportDocData = {
  username:string,
  ts: number,
}

