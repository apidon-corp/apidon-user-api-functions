import {FieldValue} from "firebase-admin/firestore";
import {onRequest} from "firebase-functions/v2/https";
import {firestore} from "../../firebase/adminApp";
import {PaymentIntentTopUpDocData} from "../../types/IAP";
import {getConfigObject} from "../../configs/getConfigObject";
import {Environment} from "@/types/Admin";

const configObject = getConfigObject();

if (!configObject) {
  throw new Error("Config object is undefined");
}

function handleAuthorization(authorization: string | undefined) {
  if (!authorization) {
    console.error("Authorization header is missing");
    return false;
  }

  if (!configObject) {
    console.error("Config object is undefined");
    return false;
  }

  if (authorization !== configObject.SUCCESS_ON_PAYMENT_API_AUTH_KEY) {
    console.error("Authorization key is invalid");
    return false;
  }

  return true;
}

function checkProps(
  productId: string,
  customerId: string,
  transactionId: string,
  ts: number,
  price: number,
  priceInPurchasedCurrency: number,
  currency: string
) {
  if (
    !productId ||
    !customerId ||
    !transactionId ||
    !ts ||
    !price ||
    !priceInPurchasedCurrency ||
    !currency
  ) {
    console.error("Missing required properties");
    return false;
  }

  return true;
}

async function checkIsUnique(username: string, transactionId: string) {
  try {
    const suspectedPaymentIntentDocSnapshot = await firestore
      .doc(
        `users/${username}/wallet/paymentIntents/paymentIntents/${transactionId}`
      )
      .get();

    if (suspectedPaymentIntentDocSnapshot.exists) {
      console.error("Payment intent already processed");
      console.error("Possible attack");

      console.error("Suspected Username: ", username);
      console.error("Suspected Transaction ID: ", transactionId);

      return false;
    }

    return true;
  } catch (error) {
    console.error("Error checking payment intent uniqueness:", error);
    return false;
  }
}

async function createPaymentIntentOnDatabase(
  username: string,
  transactionId: string,
  productId: string,
  ts: number,
  price: number,
  priceInPurchasedCurrency: number,
  currency: string
) {
  const newPaymentIntentDocData: PaymentIntentTopUpDocData = {
    transactionId: transactionId,
    refunded: false,
    success: true,
    ts: ts,
    username: username,
    productId: productId,
    price: price,
    priceInPurchasedCurrency: priceInPurchasedCurrency,
    currency: currency,
  };

  try {
    const newPaymentIntentDocRef = firestore.doc(
      `users/${username}/wallet/paymentIntents/topUpPaymentIntents/${transactionId}`
    );

    await newPaymentIntentDocRef.set(newPaymentIntentDocData);

    return {
      transactionId: transactionId,
    };
  } catch (error) {
    console.error("Error while creating payment intent on database: \n", error);
    return false;
  }
}

async function updateBalance(
  username: string,
  productId: string
): Promise<boolean> {
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

async function rollback(username: string, transactionId: string) {
  try {
    const createdPaymentIntentDocRef = firestore.doc(
      `users/${username}/wallet/paymentIntents/topUpPaymentIntents/${transactionId}`
    );

    await createdPaymentIntentDocRef.delete();

    return true;
  } catch (error) {
    console.error("Error while rolling back payment intent: \n", error);
    return false;
  }
}

export const successOnPayment = onRequest(async (req, res) => {
  const environment = process.env.ENVIRONMENT as Environment;

  if (!environment || environment === "PRODUCTION") {
    res.status(403).send("Forbidden");
    return;
  }

  const {authorization} = req.headers;
  const {
    productId,
    customerId,
    transactionId,
    ts,
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
    transactionId,
    ts,
    price,
    priceInPurchasedCurrency,
    currency
  );
  if (!propsResult) {
    res.status(422).send("Invalid Request");
    return;
  }

  const isUnique = await checkIsUnique(customerId, transactionId);
  if (!isUnique) {
    res.status(409).send("Conflict");
    return;
  }

  const createPaymentIntentOnDatabaseResult =
    await createPaymentIntentOnDatabase(
      customerId,
      transactionId,
      productId,
      ts,
      price,
      priceInPurchasedCurrency,
      currency
    );
  if (!createPaymentIntentOnDatabaseResult) {
    res.status(500).send("Internal Server Error");
    return;
  }

  const updateBalanceResult = await updateBalance(customerId, productId);
  if (!updateBalanceResult) {
    await rollback(customerId, transactionId);
    res.status(500).send("Internal Server Error");
    return;
  }

  res.status(200).send("OK");
  return;
});
