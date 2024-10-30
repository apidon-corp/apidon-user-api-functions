export type PostReviewData = {
  /**
   * A unique identifier for the review within the context of the sender.
   * This `id` is not guaranteed to be unique across the entire database but is unique when combined with `senderUsername`.
   * It is used to differentiate reviews submitted by the same user.
   */
  id: string;

  /**
   * The current status of the review, indicating whether it is pending, approved, or rejected.
   * The status can be one of the following:
   * - "pending": The review is awaiting approval.
   * - "approved": The review has been approved.
   * - { status: "rejected", rejectionReason: string }: The review has been rejected, with a reason provided.
   */
  reviewStatus: ReviewStatus;

  /**
   * The username of the user who submitted the review.
   * Combined with `id`, this forms a unique identifier for the review across the entire database.
   */
  senderUsername: string;

  /**
   * A textual description provided by the user as part of the review.
   * This can include any details or comments related to the review.
   */
  description: string;

  /**
   * A URL or path to an image associated with the review.
   * This image is provided by the user to accompany the review description.
   */
  image: string;
};

export type ReviewStatus =
  /**
   * Indicates that the review is currently pending and has not yet been reviewed.
   * It is awaiting approval or rejection.
   */
  | "pending"

  /**
   * Indicates that the review has been reviewed and approved.
   * No further action is required.
   */
  | "approved"

  /**
   * Represents a rejected review, including a reason for the rejection.
   * The `rejectionReason` provides additional context for why the review was not approved.
   */
  | {
      status: "rejected";
      rejectionReason: string;
    };

/**
 * Type of decrypted config data.
 */
export type ConfigObject = {
  serviceAccount: {
    type: string;
    project_id: string;
    private_key_id: string;
    private_key: string;
    client_email: string;
    client_id: string;
    auth_uri: string;
    token_uri: string;
    auth_provider_x509_cert_url: string;
    client_x509_cert_url: string;
    universe_domain: string;
  };

  storageBucketId: string;

  SENDGRID_EMAIL_SERVICE_API_KEY: string;

  USER_APIS_BASE_URL: string;
  NOTIFICATION_API_KEY: string;
  // Revenue Cat IAP
  REVENUE_CAT_WEBHOOK_AUTH_KEY: string;
  SUCCESS_ON_PAYMENT_API_AUTH_KEY: string;
  REFUND_API_AUTH_KEY: string;
  // Stripe Identity
  STRIPE_SECRET_KEY: string;
  STRIPE_RESTRICTED_API_KEY: string;
  POST_VERIFICATION_WEBHOOK_SECRET: string;
  HANDLE_CREATED_VERIFICATION_API_KEY: string;
  HANDLE_PROCESSING_VERIFICATION_API_KEY: string;
  HANDLE_SUCCESSFUL_VERIFICATION_API_KEY: string;
  HANDLE_REQUIRES_INPUT_VERIFICATION_API_KEY: string;
  // Admin
  ADMIN: string;
};

export type Environment =
  | "DEVELOPMENT"
  | "LOCALPREVIEW"
  | "PREVIEW"
  | "PRODUCTION";
