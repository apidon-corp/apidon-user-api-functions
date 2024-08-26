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
