import { onRequest } from "firebase-functions/v2/https";

import { keys } from "../../config";
import { firestore } from "../../firebase/adminApp";
import { FieldValue } from "firebase-admin/firestore";

function handleAuthorization(authorization: string | undefined) {
  if (!authorization) {
    console.error("Authorization header is missing");
    return false;
  }

  if (authorization !== keys.REFUND_API_AUTH_KEY) {
    console.error("Authorization key is invalid");
    return false;
  }

  return true;
}

function checkProps(
  productId: string,
  customerId: string,
  purchased_at_ms: number,
  price: number,
  priceInPurchasedCurrency: number,
  currency: string
) {
  if (
    !productId ||
    !customerId ||
    !purchased_at_ms ||
    !price ||
    !priceInPurchasedCurrency ||
    !currency
  )
    return false;

  return true;
}

async function getRevertedTopUpPaymentIntent(
  customerId: string,
  productId: string,
  currency: string,
  price: number,
  priceInPurchasedCurrency: number,
  ts: number
) {
  try {
    const queryResult = await firestore
      .collection(
        `users/${customerId}/wallet/paymentIntents/topUpPaymentIntents`
      )
      .where("productId", "==", productId)
      .where("currency", "==", currency)
      .where("price", "==", -price)
      .where("priceInPurchasedCurrency", "==", -priceInPurchasedCurrency)
      .where("ts", "==", ts)
      .get();

    if (queryResult.empty) {
      console.error("No such document to make refund");
      return false;
    }

    const docs = queryResult.docs;

    if (docs.length !== 1) {
      console.error("More than one document found");
      return false;
    }

    return docs[0].ref;
  } catch (error) {
    console.error(
      "Error occured while getting reverted top up payment intent",
      error
    );
    return false;
  }
}

async function updatePaymentIntent(ref: FirebaseFirestore.DocumentReference) {
  try {
    await ref.update({
      refunded: true,
    });
    return true;
  } catch (error) {
    console.error("Error occured while updating payment intent", error);
    return false;
  }
}

async function updateBalance(customerId: string, productBalancePrice: number) {
  if (productBalancePrice > 0) {
    console.error(
      "Product balance price is greater than 0. It should be smaller than 0, because this is a price come from refund."
    );
    return false;
  }

  try {
    await firestore.doc(`users/${customerId}/wallet/balance`).update({
      balance: FieldValue.increment(productBalancePrice),
    });
    return true;
  } catch (error) {
    console.error("Error occured while updating balance", error);
    return false;
  }
}

async function rollback(ref: FirebaseFirestore.DocumentReference) {
  try {
    await ref.update({
      refunded: false,
    });
    return true;
  } catch (error) {
    console.error("Error occured while updating payment intent", error);
    return false;
  }
}

export const refund = onRequest(async (req, res) => {
  const { authorization } = req.headers;
  const {
    productId,
    customerId,
    purchased_at_ms,
    price,
    priceInPurchasedCurrency,
    currency,
  } = req.body;

  const authResult = handleAuthorization(authorization);
  if (!authResult) {
    res.status(401).send("Unauthorized");
    return;
  }
  const propsResult = checkProps(
    productId,
    customerId,
    purchased_at_ms,
    price,
    priceInPurchasedCurrency,
    currency
  );
  if (!propsResult) {
    res.status(422).send("Invalid Request");
    return;
  }

  const revertedPaymentIntent = await getRevertedTopUpPaymentIntent(
    customerId,
    productId,
    currency,
    price,
    priceInPurchasedCurrency,
    purchased_at_ms
  );
  if (!revertedPaymentIntent) {
    res
      .status(404)
      .send("No such reverted top up payment intent found to make refund");
    return;
  }

  const updatePaymentIntentResult = await updatePaymentIntent(
    revertedPaymentIntent
  );
  if (!updatePaymentIntentResult) {
    res.status(500).send("Internal Server Error");
    return;
  }

  const updateBalanceResult = await updateBalance(customerId, price);
  if (!updateBalanceResult) {
    const rollbackResult = await rollback(revertedPaymentIntent);
    if (!rollbackResult) {
      console.error("Error occured while rolling back payment intent");
      res
        .status(500)
        .send(
          "Error occured while rolling back payment intent. Also, Internal Server Error"
        );
    }
    res.status(500).send("Internal Server Error");
    return;
  }

  res.status(200).send("OK");
});
