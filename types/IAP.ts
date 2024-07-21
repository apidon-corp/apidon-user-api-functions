export type PaymentIntentDocData =
  | {
      /**
       * The currency in which the payment is made, represented as a string (e.g., "USD", "EUR").
       */
      currency: string;

      /**
       * The unique identifier for the payment intent, used to track and reference the transaction.
       */
      id: string;

      /**
       * The amount to be paid for the post, represented as a number.
       */
      price: number;

      /**
       * A boolean indicating whether the payment has been refunded (true if refunded, false otherwise).
       */
      refunded: boolean;

      /**
       * A boolean indicating whether the payment was successful (true if successful, false otherwise).
       */
      success: boolean;

      /**
       * The timestamp of when the payment intent was created, represented as a number (typically in milliseconds since epoch).
       */
      ts: number;

      /**
       * The username of the user making the payment, represented as a string.
       */
      username: string;

      /**
       * The item id of product that bought, represented as a string.
       */
      itemSKU: string;
    }
  | {
      /**
       * The unique identifier for the payment intent, used to track and reference the transaction.
       */
      id: string;

      /**
       * A boolean indicating whether the payment has been refunded (true if refunded, false otherwise).
       */
      refunded: boolean;

      /**
       * A boolean indicating whether the payment was successful (true if successful, false otherwise).
       */
      success: boolean;

      /**
       * The timestamp of when the payment intent was created, represented as a number (typically in milliseconds since epoch).
       */
      ts: number;

      /**
       * The username of the user making the payment, represented as a string.
       */
      username: string;
    };

export type WalletTransactionsDocData = {
  walletTransactionsMap: WalletTransactionsMapArrayObject[];
};

export type WalletTransactionsMapArrayObject = {
  username: string;
  transactionId: string;
};
