import { onRequest } from "firebase-functions/v2/https";
import getDisplayName from "../../helpers/getDisplayName";
import { firestore } from "../../firebase/adminApp";
import { appCheckMiddleware } from "../../middleware/appCheckMiddleware";

import {
  PaymentIntentDocData,
  WalletTransactionsDocData,
  WalletTransactionsMapArrayObject,
} from "../../types/IAP";
import { FieldValue } from "firebase-admin/firestore";
import { keys } from "../../config";
import { environment as apiEnvironment } from "../../config";
import {
  Environment,
  JWSTransactionDecodedPayload,
  SignedDataVerifier,
} from "@apple/app-store-server-library";

import * as path from "path";
import * as fs from "fs";

/**
 * Checks if the required transactionReceipt is present in the request body.
 * @param {string} transactionReceipt - The transaction ID to check.
 * @returns {boolean} - True if transactionReceipt is present, false otherwise.
 */
function checkProps(transactionReceipt: string): boolean {
  if (!transactionReceipt) {
    console.error("No transactionId provided in the request body");
    return false;
  }
  return true;
}

/**
 * Handles authorization by fetching the username from the provided key.
 * @param {string|undefined} key - The authorization key.
 * @returns {Promise<string|false>} - The username if authorized, false otherwise.
 */
async function handleAuthorization(
  key: string | undefined
): Promise<string | false> {
  if (key === undefined) {
    console.error("Unauthorized attemp to sendReply API.");
    return false;
  }

  const operationFromUsername = await getDisplayName(key);
  if (!operationFromUsername) return false;

  return operationFromUsername;
}

/**
 * Reads a file asynchronously and returns its contents as a string.
 * @param {string} filePath - The path to the file.
 * @returns {Promise<string>} - The contents of the file as a string.
 */
const readFileAsync = async (filePath: string): Promise<string> => {
  return await fs.promises.readFile(filePath, "utf8");
};

/**
 * Reads a certificate file asynchronously and returns its contents as a Buffer.
 * @param {string} filePath - The path to the certificate file.
 * @returns {Promise<Buffer>} - The contents of the certificate file as a Buffer.
 */
const readCertificate = async (filePath: string): Promise<Buffer> => {
  const data = await readFileAsync(filePath);
  return Buffer.from(data);
};

/**
 * Retrieves the paths to Apple root certificates and reads their contents.
 * @returns {Promise<Buffer[]>} - An array of Apple root certificates.
 */
async function getAppleRootCerts(): Promise<Buffer[]> {
  const certPaths = [
    path.resolve(__dirname, "root_certs/AppleRootCA-G3.pem"),
    path.resolve(__dirname, "root_certs/AppleRootCA-G2.pem"),
    path.resolve(__dirname, "root_certs/AppleComputerRootCertificate.pem"),
    path.resolve(__dirname, "root_certs/AppleIncRootCertificate.pem"),
  ];

  const appleRootCertificates = await Promise.all(
    certPaths.map(readCertificate)
  );

  return appleRootCertificates;
}

/**
 * Creates a SignedDataVerifier instance for verifying Apple IAP receipts.
 * @returns {Promise<SignedDataVerifier>} - The created verifier.
 */
async function getVerifier(): Promise<SignedDataVerifier> {
  const bundleId = keys.appleInAppPurchaseKeys.bundleId;

  const environment =
    apiEnvironment === "development"
      ? Environment.XCODE
      : apiEnvironment === "preview"
      ? Environment.SANDBOX
      : Environment.PRODUCTION;

  const enableOnChecks = true;
  const appAppleId = keys.appleInAppPurchaseKeys.appAppleId;
  const appleCerts = await getAppleRootCerts();

  const verifier = new SignedDataVerifier(
    appleCerts,
    enableOnChecks,
    environment,
    bundleId,
    appAppleId
  );

  return verifier;
}

/**
 * Verifies and decodes the provided transaction receipt using the verifier.
 * @param {string} transactionReceipt - The transaction receipt to verify.
 * @param {SignedDataVerifier} verifier - The verifier instance.
 * @returns {Promise<JWSTransactionDecodedPayload>} - The decoded transaction data.
 */
async function verifyAndDecodeReceipt(
  transactionReceipt: string,
  verifier: SignedDataVerifier
): Promise<JWSTransactionDecodedPayload> {
  const decodedReceipt = await verifier.verifyAndDecodeTransaction(
    transactionReceipt
  );

  console.log("Decoded Receipt: ", decodedReceipt);

  return decodedReceipt;
}

/**
 * Checks if the payment intent for the transaction already exists in the database.
 * @param {JWSTransactionDecodedPayload} transactionData - The transaction data.
 * @param {string} username - The user's username.
 * @returns {Promise<boolean>} - True if the payment intent does not exist, false otherwise.
 */
async function isValidRequest(
  transactionData: JWSTransactionDecodedPayload,
  username: string
): Promise<boolean> {
  const transactionId = transactionData.transactionId;
  if (!transactionId) {
    console.error("No transactionId found in the decoded transaction data");
    return false;
  }

  try {
    const suspectedPaymentIntentDocSnapshot = await firestore
      .doc(
        `users/${username}/wallet/paymentIntents/paymentIntents/${transactionId}`
      )
      .get();

    if (!suspectedPaymentIntentDocSnapshot.exists) {
      console.log("Payment intent not found on database, we are good to go.");
      return true;
    }

    console.error("Payment intent already exists on database");
    console.error("Possible Attack");

    console.error("Suspected Transaction Id: ", transactionId);
    console.error("Suspected Username: ", username);

    console.error("Suspected Transaction Data: ", transactionData);

    return false;
  } catch (error) {
    console.error("Error while checking already proceed: \n", error);
    return false;
  }
}

/**
 * Checks if the transaction is unique by checking the walletTransactionsMap.
 * @param {JWSTransactionDecodedPayload} transactionData - The transaction data.
 * @returns {Promise<boolean>} - True if the transaction is unique, false otherwise.
 */
async function isUniqueRequest(
  transactionData: JWSTransactionDecodedPayload
): Promise<boolean> {
  const transactionId = transactionData.transactionId;
  if (!transactionId) {
    console.error("No transactionId found in the decoded transaction data");
    return false;
  }

  try {
    const walletTransactionsDocSnapshot = await firestore
      .doc(`payment/walletTransactions`)
      .get();

    if (!walletTransactionsDocSnapshot.exists) {
      console.error("No walletTransactions document found on database");
      return false;
    }

    const walletTransactionsDocData =
      walletTransactionsDocSnapshot.data() as WalletTransactionsDocData;

    const walletTransactionsMap =
      walletTransactionsDocData.walletTransactionsMap;

    if (!walletTransactionsMap) {
      console.error("No walletTransactionsMap (array) found on database");
      return false;
    }

    const foundTransactionWithNewTransactionId = walletTransactionsMap.find(
      (transaction) => {
        return transaction.transactionId === transactionId;
      }
    );

    if (!foundTransactionWithNewTransactionId) {
      console.log("No duplicate found, we are good to go.");
      return true;
    }

    console.error("Duplicate found, possible attack");
    console.error("Suspected Transaction Id: ", transactionId);
    console.error("Suspected Transaction Data: ", transactionData);
    console.error(
      "Found Transaction Data: (duplicated) ",
      foundTransactionWithNewTransactionId
    );

    return false;
  } catch (error) {
    console.error("Error while checking unique request: \n", error);
    return false;
  }
}

/**
 * Creates a new payment intent document in the database.
 * @param {string} username - The user's username.
 * @param {JWSTransactionDecodedPayload} decodedTransactionData - The decoded transaction data.
 * @returns {Promise<false|{ transactionId: string }>} - Returns false on error, or an object containing the transactionId on success.
 */
async function createPaymentIntentOnDatabase(
  username: string,
  decodedTransactionData: JWSTransactionDecodedPayload
): Promise<false | { transactionId: string }> {
  if (!decodedTransactionData.transactionId) {
    console.error("No transactionId found in the decoded transaction data");
    return false;
  }

  const newPaymentIntentDocData: PaymentIntentDocData = {
    currency: decodedTransactionData.currency || "undefined_from_decoded_token",
    id: decodedTransactionData.transactionId,
    price: decodedTransactionData.price || 0,
    refunded: false,
    success: true,
    ts: decodedTransactionData.purchaseDate || Date.now(),
    username: username,
    itemSKU: decodedTransactionData.productId || "undefined_from_decoded_token",
  };

  try {
    const newPaymentIntentDocRef = firestore.doc(
      `users/${username}/wallet/paymentIntents/paymentIntents/${decodedTransactionData.transactionId}`
    );

    await newPaymentIntentDocRef.set(newPaymentIntentDocData);

    return {
      transactionId: decodedTransactionData.transactionId,
    };
  } catch (error) {
    console.error("Error while creating payment intent on database: \n", error);
    return false;
  }
}

/**
 * Creates a mapping between the transaction and the user in the database.
 * @param {string} username - The user's username.
 * @param {JWSTransactionDecodedPayload} transactionData - The transaction data.
 * @returns {Promise<false|WalletTransactionsMapArrayObject>} - Returns false on error, or the created mapping object on success.
 */
async function createMappingOnDatabase(
  username: string,
  transactionData: JWSTransactionDecodedPayload
): Promise<false | WalletTransactionsMapArrayObject> {
  const transactionId = transactionData.transactionId;
  if (!transactionId) {
    console.error("No transactionId found in the decoded transaction data");
    return false;
  }

  try {
    const walletTransactionsDocRef = firestore.doc(
      "payment/walletTransactions"
    );

    const newMappingObject: WalletTransactionsMapArrayObject = {
      transactionId: transactionId,
      username: username,
    };

    await walletTransactionsDocRef.update({
      walletTransactionsMap: FieldValue.arrayUnion(newMappingObject),
    });

    return newMappingObject;
  } catch (error) {
    console.error("Error while creating mapping on database: \n", error);
    return false;
  }
}

/**
 * Updates the user's balance based on the transaction data.
 * @param {string} username - The user's username.
 * @param {JWSTransactionDecodedPayload} transactionData - The transaction data.
 * @returns {Promise<boolean>} - True on success, false on error.
 */
async function updateBalance(
  username: string,
  transactionData: JWSTransactionDecodedPayload
): Promise<boolean> {
  const productId = transactionData.productId;
  if (!productId) {
    console.error("No productId found in the decoded transaction data");
    return false;
  }

  const value = productId.split("_")[0];

  if (!value) {
    console.error("No value found in the productId. (Destructing array.)");
    return false;
  }

  const valueInNumber = parseInt(value);
  if (isNaN(valueInNumber)) {
    console.error("Value is not a number.");
    return false;
  }

  if (!valueInNumber) {
    console.error("Value is zero.");
    return false;
  }

  const price = valueInNumber;

  try {
    const balanceDocRef = firestore.doc(`users/${username}/wallet/balance`);

    await balanceDocRef.update({
      balance: FieldValue.increment(price),
    });

    return true;
  } catch (error) {
    console.error("Error while updating balance: \n", error);
    return false;
  }
}

/**
 * Rolls back the transaction by deleting the payment intent and mapping.
 * @param {string} username - The user's username.
 * @param {false|{ transactionId: string }} createPaymentIntentOnDatabaseResult - The result of creating the payment intent.
 * @param {false|WalletTransactionsMapArrayObject} createMappingOnDatabaseResult - The result of creating the mapping.
 * @returns {Promise<boolean>} - True on success, false on error.
 */
async function rollback(
  username: string,
  createPaymentIntentOnDatabaseResult?: false | { transactionId: string },
  createMappingOnDatabaseResult?: false | WalletTransactionsMapArrayObject
): Promise<boolean> {
  if (createPaymentIntentOnDatabaseResult) {
    try {
      const createdPaymentIntentDocRef = firestore.doc(
        `users/${username}/wallet/paymentIntents/paymentIntents/${createPaymentIntentOnDatabaseResult.transactionId}`
      );

      await createdPaymentIntentDocRef.delete();

      return true;
    } catch (error) {
      console.error("Error while rolling back payment intent: \n", error);
      return false;
    }
  }

  if (createMappingOnDatabaseResult) {
    try {
      const walletTransactionsDocRef = firestore.doc(
        "payment/walletTransactions"
      );

      await walletTransactionsDocRef.update({
        walletTransactionsMap: FieldValue.arrayRemove(
          createMappingOnDatabaseResult
        ),
      });

      return true;
    } catch (error) {
      console.error("Error while rolling back mapping: \n", error);
      return false;
    }
  }

  return true;
}

export const createPayment = onRequest(
  appCheckMiddleware(async (req, res) => {
    const { authorization } = req.headers;
    const { transactionReceipt } = req.body;

    const username = await handleAuthorization(authorization);
    if (!username) {
      res.status(401).send("Unauthorized");
      return;
    }

    const checkPropsResult = checkProps(transactionReceipt);
    if (!checkPropsResult) {
      res.status(422).send("Invalid Request");
      return;
    }

    const verifier = await getVerifier();

    const transactionData = await verifyAndDecodeReceipt(
      transactionReceipt,
      verifier
    );

    const isValidRequestResult = await isValidRequest(
      transactionData,
      username
    );
    if (!isValidRequestResult) {
      res.status(500).send("Internal Server Error");
      return;
    }

    const isUniqueRequestResult = await isUniqueRequest(transactionData);
    if (!isUniqueRequestResult) {
      res.status(500).send("Internal Server Error");
      return;
    }

    const createPaymentIntentOnDatabaseResult =
      await createPaymentIntentOnDatabase(username, transactionData);

    if (!createPaymentIntentOnDatabaseResult) {
      await rollback(username, createPaymentIntentOnDatabaseResult);
      res.status(500).send("Error while creating payment intent on database");
      return;
    }

    const createMappingOnDatabaseResult = await createMappingOnDatabase(
      username,
      transactionData
    );

    if (!createMappingOnDatabaseResult) {
      await rollback(
        username,
        createPaymentIntentOnDatabaseResult,
        createMappingOnDatabaseResult
      );
      res.status(500).send("Error while creating mapping on database");
      return;
    }

    const updateBalanceResult = await updateBalance(username, transactionData);
    if (!updateBalanceResult) {
      await rollback(
        username,
        createPaymentIntentOnDatabaseResult,
        createMappingOnDatabaseResult
      );
      res.status(500).send("Error while updating balance");
      return;
    }

    res.status(200).send("Success");
    return;
  })
);
