/**
 * Can be used on Firebase Firestore.
 */
export type FrenletServerData = {
  commentCount: number;
  comments: { comment: string; sender: string; ts: number }[];
  frenletDocId: string;
  frenletSender: string;
  frenletReceiver: string;
  likeCount: number;
  likes: {
    sender: string;
    ts: number;
  }[];
  message: string;
  replies: RepletServerData[];
  tag: string;
  ts: number;
};
/**
 * Can be used on Firebase Firestore.
 */
export type RepletServerData = {
  message: string;
  sender: string;
  ts: number;
};

/**
 * Can be used on Firebase Firestore
 */
export type FrenletsServerData = {
  tags: string[];
};
