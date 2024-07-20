import { onRequest } from "firebase-functions/v2/https";
import getDisplayName from "../../helpers/getDisplayName";
import { firestore } from "../../firebase/adminApp";
import { appCheckMiddleware } from "../../middleware/appCheckMiddleware";

import {
  PaymentIntentDocData,
  WalletTransactionsMapArrayObject,
} from "../../types/IAP";
import { FieldValue } from "firebase-admin/firestore";

function checkProps(transactionId: string) {
  if (!transactionId) {
    console.error("No transactionId provided in the request body");
    return false;
  }
  return true;
}

async function handleAuthorization(key: string | undefined) {
  if (key === undefined) {
    console.error("Unauthorized attemp to sendReply API.");
    return false;
  }

  const operationFromUsername = await getDisplayName(key);
  if (!operationFromUsername) return false;

  return operationFromUsername;
}

async function createPaymentIntentOnDatabase(
  username: string,
  transactionId: string
) {
  try {
    const newPaymentIntentDocRef = firestore.doc(
      `users/${username}/wallet/paymentIntents/paymentIntents/${transactionId}`
    );
    const newPaymentIntentDocData: PaymentIntentDocData = {
      id: transactionId,
      refunded: false,
      success: false,
      ts: Date.now(),
      username: username,
    };

    await newPaymentIntentDocRef.set(newPaymentIntentDocData);

    return true;
  } catch (error) {
    console.error("Error while creating payment intent on database: \n", error);
    return false;
  }
}

async function createMappingOnDatabase(
  username: string,
  transactionId: string
) {
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

    return true;
  } catch (error) {
    console.error("Error while creating mapping on database: \n", error);
    return false;
  }
}

export const createPayment = onRequest(
  appCheckMiddleware(async (req, res) => {
    const { authorization } = req.headers;
    const { transactionId } = req.body;

    const username = await handleAuthorization(authorization);
    if (!username) {
      res.status(401).send("Unauthorized");
      return;
    }

    const checkPropsResult = checkProps(transactionId);
    if (!checkPropsResult) {
      res.status(422).send("Invalid Request");
      return;
    }

    const createPaymentIntentOnDatabaseResult =
      await createPaymentIntentOnDatabase(username, transactionId);

    if (!createPaymentIntentOnDatabaseResult) {
      res.status(500).send("Error while creating payment intent on database");
      return;
    }

    const createMappingOnDatabaseResult = await createMappingOnDatabase(
      username,
      transactionId
    );

    if (!createMappingOnDatabaseResult) {
      res.status(500).send("Error while creating mapping on database");
      return;
    }

    res.status(200).send("Success");
    return;
  })
);
