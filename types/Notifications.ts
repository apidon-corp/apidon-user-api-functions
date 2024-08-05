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
    }
  | {
      /**
       * Type of the notification.
       * This notification indicates a collectible bought action.
       */
      type: "collectibleBought";

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
         * The document path of the collected post.
         */
        collectiblePostDocPath: string;
        price: number;
        currency: "USD";
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
