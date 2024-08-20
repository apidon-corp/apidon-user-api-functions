import {onRequest} from "firebase-functions/v2/https";

import {keys} from "../../config";
import {SubscriptionDocData} from "../../types/Subscriptions";

import {firestore} from "./../../firebase/adminApp";

function handleAuthorization(authorization: string | undefined) {
  if (!authorization) {
    console.error("Authorization header is missing");
    return false;
  }

  if (authorization !== keys.SUBSCRIPTIONS.INITIAL_PURHCASE_API_KEY) {
    console.error("Authorization key is invalid");
    return false;
  }

  return true;
}

// Offer code can be empty string.
function checkProps(
  productId: string,
  periodType: string,
  purchasedTs: number,
  expirationTs: number,
  store: string,
  environment: string,
  countryCode: string,
  customerId: string,
  transactionId: string,
  ts: number,
  price: number,
  priceInPurchasedCurrency: number,
  currency: string
) {
  if (
    !productId ||
    !periodType ||
    !purchasedTs ||
    !expirationTs ||
    !store ||
    !environment ||
    !countryCode ||
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

async function checkIfThereIsActiveSubscriptionDoc(username: string) {
  try {
    const query = await firestore
      .collection(`users/${username}/subscriptions`)
      .where("isActive", "==", true)
      .get();

    if (query.size === 0) return true;

    console.error("There is already an active subscription");
    return false;
  } catch (error) {
    console.error("Error checking active subscription", error);
    return false;
  }
}

async function createSubscriptionDocOnDatabase(
  subscriptionDocData: SubscriptionDocData,
  customerId: string
) {
  try {
    await firestore
      .doc(
        `users/${customerId}/subscriptions/${subscriptionDocData.transactionId}`
      )
      .set(subscriptionDocData);

    return true;
  } catch (error) {
    console.error("Error creating subscription document", error);
    return false;
  }
}

export const successOnInitialPurchase = onRequest(async (req, res) => {
  const {authorization} = req.headers;

  const {
    productId,
    periodType,
    purchasedTs,
    expirationTs,
    store,
    environment,
    countryCode,
    customerId,
    transactionId,
    offerCode,
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
  const propCheck = checkProps(
    productId,
    periodType,
    purchasedTs,
    expirationTs,
    store,
    environment,
    countryCode,
    customerId,
    transactionId,
    ts,
    price,
    priceInPurchasedCurrency,
    currency
  );
  if (!propCheck) {
    res.status(422).send("Invalid Request");
    return;
  }

  const activeSubscriptionCheck = await checkIfThereIsActiveSubscriptionDoc(
    customerId
  );
  if (!activeSubscriptionCheck) {
    res.status(409).send("Conflict");
    return;
  }

  const subscriptionDocData: SubscriptionDocData = {
    isActive: true,
    productId,
    periodType,
    purchasedTs,
    expirationTs,
    store,
    environment,
    countryCode,
    offerCode,
    customerId,
    transactionId,
    ts,
    price,
    priceInPurchasedCurrency,
    currency,
  };

  const docCreationResult = await createSubscriptionDocOnDatabase(
    subscriptionDocData,
    customerId
  );
  if (!docCreationResult) {
    res.status(500).send("Internal Server Error");
    return;
  }

  res.status(200).send("OK");
  return;
});