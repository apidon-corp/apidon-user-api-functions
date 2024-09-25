export type CommentInteractionData = {
  postDocPath: string;
  creationTime: number;
};

/**
 * @deprecated
 */
export type UploadedPostArrayObject = {
  timestamp: number;
  postDocPath: string;
};

export type UploadedPostDocData = {
  postDocPath: string;
  timestamp: number;
};

/**
 * @deprecated
 */
export type PostInteractions = {
  commentedPostsArray: CommentInteractionData[];
  likedPostsArray: string[];
  uploadedPostArray: UploadedPostArrayObject[];
  uploadedPostsArray: UploadedPostArrayObject[];
};
