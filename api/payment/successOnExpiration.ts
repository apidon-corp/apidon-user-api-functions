import {onRequest} from "firebase-functions/v2/https";
import {keys} from "../../config";
import {firestore} from "../../firebase/adminApp";
import {CollectibleUsageDocData} from "../../types/CollectibleUsage";

function handleAuthorization(authorization: string | undefined) {
  if (!authorization) {
    console.error("Authorization header is missing");
    return false;
  }

  if (authorization !== keys.SUBSCRIPTIONS.EXPIRATION_API_KEY) {
    console.error("Authorization key is invalid");
    return false;
  }

  return true;
}

function checkProps(customerId: string, productId: string) {
  if (!customerId || !productId) {
    console.error("customerId or productId is missing");
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

    if (query.size === 0) {
      console.error("There is no active subscription to expired.");
      return false;
    }

    if (query.size !== 1) {
      console.error("There is more than one active subscription to expired.");
      return false;
    }

    return query.docs[0].ref.path;
  } catch (error) {
    console.error("Error checking active subscription", error);
    return false;
  }
}

async function expireSubscriptionDoc(subscriptionDocPath: string) {
  try {
    await firestore.doc(subscriptionDocPath).update({
      isActive: false,
    });
    return subscriptionDocPath;
  } catch (error) {
    console.error("Error expiring subscription", error);
    return false;
  }
}

async function updateSubscriptionUsage(username: string) {
  try {
    const collectibleUsageDoc = firestore.doc(
      `users/${username}/collectible/usage`
    );

    const newUsageDocData: CollectibleUsageDocData = {
      limit: keys.SUBSCRIPTIONS.usageLimits.free,
      used: 0,
      planId: "free",
      subscriptionDocPath: "",
    };

    await collectibleUsageDoc.set(newUsageDocData);

    return true;
  } catch (error) {
    console.error("Error updating subscription usage", error);
    return false;
  }
}

async function rollback(expiredSubscriptionDocPath: string) {
  try {
    await firestore.doc(expiredSubscriptionDocPath).update({isActive: true});
    return true;
  } catch (error) {
    console.error("Error rolling back subscription", error);
    return false;
  }
}

export const successOnExpiration = onRequest(async (req, res) => {
  const {authorization} = req.headers;
  const {customerId, productId} = req.body;

  const authResult = handleAuthorization(authorization);
  if (!authResult) {
    res.status(401).send("Unauthorized");
    return;
  }

  const checkPropsResult = checkProps(customerId, productId);
  if (!checkPropsResult) {
    res.status(422).send("Invalid Props");
    return;
  }

  const subscriptionDocPath = await checkIfThereIsActiveSubscriptionDoc(
    customerId
  );
  if (!subscriptionDocPath) {
    res.status(409).send("Conflict");
    return;
  }

  const success = await expireSubscriptionDoc(subscriptionDocPath);
  if (!success) {
    res.status(500).send("Internal Server Error");
    return;
  }

  const updateUsageResult = await updateSubscriptionUsage(customerId);
  if (!updateUsageResult) {
    await rollback(subscriptionDocPath);
    res.status(500).send("Internal Server Error");
    return;
  }

  res.status(200).send("OK");
  return;
});
