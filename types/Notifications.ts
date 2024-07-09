export type NotificationDocData = {
  notifications: NotificationData[];
  lastOpenedTime: number;
  notificationToken: string;
};

export type NotificationData =
  | {
      /**
       * Type of the notification.
       * This notification indicates a follow action.
       */
      type: "follow";

      /**
       * Recipient of the notification.
       */
      target: string;

      /**
       * Sender of the notification.
       */
      source: string;

      /**
       * Timestamp of when the notification was sent.
       */
      timestamp: number;

      /**
       * Additional parameters related to the follow notification.
       */
      params: {
        /**
         * The ID of the user being followed.
         */
        followOperationTo: string;
      };
    }
  | {
      /**
       * Type of the notification.
       * This notification indicates a comment action.
       */
      type: "comment";

      /**
       * Recipient of the notification.
       */
      target: string;

      /**
       * Sender of the notification.
       */
      source: string;

      /**
       * Timestamp of when the notification was sent.
       */
      timestamp: number;

      /**
       * Additional parameters related to the comment notification.
       */
      params: {
        /**
         * The document path of the commented post.
         */
        commentedPostDocPath: string;

        /**
         * Comment made by source.
         */
        comment: string;
      };
    }
  | {
      /**
       * Type of the notification.
       * This notification indicates a frenlet creation action.
       */
      type: "frenletCreate";

      /**
       * Recipient of the notification.
       */
      target: string;

      /**
       * Sender of the notification.
       */
      source: string;

      /**
       * Timestamp of when the notification was sent.
       */
      timestamp: number;

      /**
       * Additional parameters related to the frenlet creation notification.
       */
      params: {
        /**
         * The document path of the created frenlet.
         */
        createdFrenletDocPath: string;
        message: string;
      };
    }
  | {
      /**
       * Type of the notification.
       * This notification indicates a frenlet reply action.
       */
      type: "frenletReply";

      /**
       * Recipient of the notification.
       */
      target: string;

      /**
       * Sender of the notification.
       */
      source: string;

      /**
       * Timestamp of when the notification was sent.
       */
      timestamp: number;

      /**
       * Additional parameters related to the frenlet reply notification.
       */
      params: {
        /**
         * The document path of the replied frenlet.
         */
        repliedFrenletDocPath: string;
        message: string;
      };
    }
  | {
      /**
       * Type of the notification.
       * This notification indicates a post rating action.
       */
      type: "ratePost";

      /**
       * Recipient of the notification.
       */
      target: string;

      /**
       * Sender of the notification.
       */
      source: string;

      /**
       * Timestamp of when the notification was sent.
       */
      timestamp: number;

      /**
       * Additional parameters related to the post rating notification.
       */
      params: {
        /**
         * The document path of the rated post.
         */
        ratedPostDocPath: string;
        rate: number;
      };
    };

export type ExpoPushToken = string;

export type ExpoPushMessage = {
  to: ExpoPushToken | ExpoPushToken[];
  data?: object;
  title?: string;
  subtitle?: string;
  body?: string;
  sound?:
    | "default"
    | null
    | {
        critical?: boolean;
        name?: "default" | null;
        volume?: number;
      };
  ttl?: number;
  expiration?: number;
  priority?: "default" | "normal" | "high";
  badge?: number;
  channelId?: string;
  categoryId?: string;
  mutableContent?: boolean;
};
