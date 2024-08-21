import {onRequest} from "firebase-functions/v2/https";

import {keys} from "../../config";
import {
  SubscriptionDocData,
  SubscriptionProductIds,
} from "../../types/Subscriptions";

import {firestore} from "./../../firebase/adminApp";
import {CollectibleUsageDocData} from "../../types/CollectibleUsage";

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
  const path = `users/${customerId}/subscriptions/${subscriptionDocData.transactionId}`;

  try {
    await firestore.doc(path).set(subscriptionDocData);

    return path;
  } catch (error) {
    console.error("Error creating subscription document", error);
    return false;
  }
}

async function updateSubscriptionUsage(
  username: string,
  subscriptionIdentifier: SubscriptionProductIds,
  subscriptionDocPath: string
) {
  try {
    const collectibleUsageDoc = firestore.doc(
      `users/${username}/collectible/usage`
    );

    let limit = 0;

    if (subscriptionIdentifier === "dev_apidon_collector_10_1m") {
      limit = keys.SUBSCRIPTIONS.usageLimits.collector;
    }
    if (subscriptionIdentifier === "dev_apidon_creator_10_1m") {
      limit = keys.SUBSCRIPTIONS.usageLimits.creator;
    }
    if (subscriptionIdentifier === "dev_apidon_visionary_10_1m") {
      limit = keys.SUBSCRIPTIONS.usageLimits.visionary;
    }

    const newUsageDocData: CollectibleUsageDocData = {
      limit: limit,
      used: 0,
      planId: subscriptionIdentifier,
      subscriptionDocPath: subscriptionDocPath,
    };

    await collectibleUsageDoc.set(newUsageDocData);

    return true;
  } catch (error) {
    console.error("Error updating subscription usage", error);
    return false;
  }
}

async function rollback(createdSubscriptionDocPath: string) {
  try {
    await firestore.doc(createdSubscriptionDocPath).update({isActive: false});
    return true;
  } catch (error) {
    console.error("Error rolling back new subscription", error);
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

  const updateSubscriptionUsageResult = await updateSubscriptionUsage(
    customerId,
    productId,
    docCreationResult
  );
  if (!updateSubscriptionUsageResult) {
    await rollback(docCreationResult);
    res.status(500).send("Internal Server Error");
    return;
  }

  res.status(200).send("OK");
  return;
});
