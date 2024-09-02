export type WithdrawRequestDocData = {
  /** Unique identifier for each withdraw request */
  requestId: string;

  /** Username or user ID making the request */
  username: string;

  /** Amount requested for withdraw */
  requestedAmount: number;

  /** Currency of the withdraw */
  currency: string;

  /** Bank details required if the payment method is a bank transfer */
  bankDetails: {
    /** Name of the account holder for bank transfers */
    accountHolderName: string;

    /** Name of the bank */
    bankName: string;

    /** Bank account number */
    accountNumber: string;

    /** SWIFT/BIC code for international transfers (if applicable) */
    swiftCode: string;

    /** Bank routing number */
    routingNumber?: string;
  };

  /** Timestamp when the withdraw request was made */
  requestedDate: number;

  /** Current status of the withdraw request */
  status: "pending" | "approved" | "rejected";

  /** Any additional notes or comments */
  notes: string;
};
