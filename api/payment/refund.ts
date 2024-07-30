import {onRequest} from "firebase-functions/v2/https";

import {keys} from "../../config";
import {firestore} from "../../firebase/adminApp";
import {FieldValue} from "firebase-admin/firestore";
import {PaymentIntentTopUpDocData} from "@/types/IAP";

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
  transactionId: string
) {
  if (!productId || !customerId || !transactionId) {
    return false;
  }

  return true;
}

async function getRevertedTopUpPaymentIntent(
  customerId: string,
  productId: string,
  transactionId: string
) {
  try {
    const revertedIntentDocSnapshot = await firestore
      .doc(
        `users/${customerId}/wallet/paymentIntents/topUpPaymentIntents/${transactionId}`
      )
      .get();

    if (!revertedIntentDocSnapshot.exists) {
      console.error("No such document to make refund");
      return false;
    }

    const intentDocData =
      revertedIntentDocSnapshot.data() as PaymentIntentTopUpDocData;
    if (!intentDocData) {
      console.error("Intent doc data is undefined.");
      return false;
    }

    if (!intentDocData.success) {
      console.error("This payment intent is not even successfull to refund.");
      return false;
    }

    if (intentDocData.refunded) {
      console.error("This payment intent is already refunded.");
      return false;
    }

    if (intentDocData.itemSKU !== productId) {
      console.error("Product id is not matching");

      console.error(
        `Intent doc data item sku: ${intentDocData.itemSKU}, product id: (came from notification) ${productId}`
      );

      return false;
    }

    return revertedIntentDocSnapshot.ref;
  } catch (error) {
    console.error(
      "Error occured while getting reverted top up payment intent",
      error
    );
    return false;
  }
}

function extractCreditCountFromProductId(productId: string) {
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

  return price;
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
  const {authorization} = req.headers;
  const {productId, customerId, transactionId} = req.body;

  const authResult = handleAuthorization(authorization);
  if (!authResult) {
    res.status(401).send("Unauthorized");
    return;
  }
  const propsResult = checkProps(productId, customerId, transactionId);
  if (!propsResult) {
    res.status(422).send("Invalid Request");
    return;
  }

  const revertedPaymentIntent = await getRevertedTopUpPaymentIntent(
    customerId,
    productId,
    transactionId
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

  const priceToDecreaseInUSDCreditFormat =
    extractCreditCountFromProductId(productId);

  if (!priceToDecreaseInUSDCreditFormat) {
    res.status(500).send("Internal Server Error");
    return;
  }

  const updateBalanceResult = await updateBalance(
    customerId,
    priceToDecreaseInUSDCreditFormat
  );
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
