import {onRequest} from "firebase-functions/v2/https";

import {keys} from "../../config";

import {firestore} from "../../firebase/adminApp";
import {SubscriptionDocData} from "../../types/Subscriptions";
import {CollectibleUsageDocData} from "../../types/CollectibleUsage";
import {PlanDocData} from "../../types/Plan";

function handleAuthorization(authorization: string | undefined) {
  if (!authorization) {
    console.error("Authorization header is missing");
    return false;
  }

  if (authorization !== keys.SUBSCRIPTIONS.RENEWAL_API_KEY) {
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

async function updateExistingActiveSubscriptionDoc(username: string) {
  try {
    const query = await firestore
      .collection(`users/${username}/subscriptions`)
      .where("isActive", "==", true)
      .get();

    if (query.size === 0) {
      console.warn(
        "No active subscription found to update its isActive field. (for renewal operation). But Apple sends renewal event for on re-subs."
      );
      return "not-found";
    }

    if (query.size !== 1) {
      console.error(
        "More than one active subscription found to update its isActive field. (for renewal operation)"
      );
      return false;
    }

    const activeDoc = query.docs[0];

    await activeDoc.ref.update({isActive: false});

    return activeDoc.ref.path;
  } catch (error) {
    console.error("Error updating existing active subscription", error);
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

async function getSubscriptionPlanDetails(subscriptionIdentifier: string) {
  try {
    const planDetailSnapshot = await firestore
      .doc(`plans/${subscriptionIdentifier}`)
      .get();

    if (!planDetailSnapshot.exists) {
      console.error("planDetail not found");
      return false;
    }

    const data = planDetailSnapshot.data() as PlanDocData;

    if (!data) {
      console.error("Subscription plan details is undefined.");
      return false;
    }

    return data;
  } catch (error) {
    console.error("Error getting subscription plan details", error);
    return false;
  }
}

function calculateLimit(planDocData: PlanDocData) {
  let limit = 0;

  if (planDocData.collectible.upToFive) limit = 5;
  if (planDocData.collectible.upToTen) limit = 10;
  if (planDocData.collectible.upToFifthy) limit = 50;
  if (planDocData.collectible.upToHundred) limit = 100;

  return limit;
}

async function updateSubscriptionUsage(
  username: string,
  planDocData: PlanDocData,
  subscriptionDocPath: string
) {
  try {
    const collectibleUsageDoc = firestore.doc(
      `users/${username}/collectible/usage`
    );

    const limit = calculateLimit(planDocData);

    const newUsageDocData: CollectibleUsageDocData = {
      limit: limit,
      used: 0,
      planId: planDocData.storeProductId,
      subscriptionDocPath: subscriptionDocPath,
    };

    await collectibleUsageDoc.set(newUsageDocData);

    return true;
  } catch (error) {
    console.error("Error updating subscription usage", error);
    return false;
  }
}

async function rollback(
  updatedDocPath: string,
  createSubscriptionDocPath?: string
) {
  if (updatedDocPath === "not-found") return;

  if (updatedDocPath) {
    try {
      await firestore.doc(updatedDocPath).update({isActive: true});
    } catch (error) {
      console.error("Error rolling back expired subscription doc.", error);
    }
  }
  if (createSubscriptionDocPath) {
    try {
      await firestore.doc(createSubscriptionDocPath).update({
        isActive: false,
      });
    } catch (error) {
      console.error("Error rolling back new subscription doc.", error);
    }
  }
}

export const successOnRenewal = onRequest(async (req, res) => {
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

  const propsCheck = checkProps(
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
  if (!propsCheck) {
    res.status(400).send("Bad Request");
    return;
  }

  const planDetails = await getSubscriptionPlanDetails(productId);
  if (!planDetails) {
    res.status(500).send("Internal Server Error");
    return;
  }

  const updateResult = await updateExistingActiveSubscriptionDoc(customerId);
  if (!updateResult) {
    res.status(500).send("Internal Server Error");
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
    await rollback(updateResult);
    res.status(500).send("Internal Server Error");
    return;
  }

  const usageUpdateResult = await updateSubscriptionUsage(
    customerId,
    planDetails,
    docCreationResult
  );
  if (!usageUpdateResult) {
    await rollback(updateResult, docCreationResult);
    res.status(500).send("Internal Server Error");
    return;
  }

  res.status(200).send("OK");
  return;
});
