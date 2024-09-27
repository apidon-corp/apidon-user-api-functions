export type CommentInteractionDocData = {
  postDocPath: string;
  creationTime: number;
};

export type RateInteractionDocData = {
  postDocPath: string;
  creationTime: number;
  rate:number,
};

/**
 * @deprecated
 */
export type UploadedPostArrayObject = {
  timestamp: number;
  postDocPath: string;
};

export type UploadedPostInteractionDocData = {
  postDocPath: string;
  timestamp: number;
};

/**
 * @deprecated
 */
export type PostInteractions = {
  commentedPostsArray: CommentInteractionDocData[];
  likedPostsArray: string[];
  uploadedPostArray: UploadedPostArrayObject[];
  uploadedPostsArray: UploadedPostArrayObject[];
};
