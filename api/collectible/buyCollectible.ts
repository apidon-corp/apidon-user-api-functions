import { FieldValue } from "firebase-admin/firestore";
import { onRequest } from "firebase-functions/v2/https";
import { internalAPIRoutes } from "../../config";
import { getConfigObject } from "../../configs/getConfigObject";
import { firestore } from "../../firebase/adminApp";
import getDisplayName from "../../helpers/getDisplayName";
import { appCheckMiddleware } from "../../middleware/appCheckMiddleware";
import { CollectibleDocData, CollectorDocData } from "../../types/Collectible";

import { ReceivedNotificationDocData } from "@/types/Notifications";
import { PostServerData } from "../../types/Post";
import {
  BoughtCollectibleDocData,
  PurhcasePaymentIntentDocData,
  SellPaymentIntentDocData,
  SoldCollectibleDocData,
} from "../../types/Trade";
import { BalanceDocData } from "../../types/Wallet";

const configObject = getConfigObject();

if (!configObject) {
  throw new Error("Config object is undefined");
}

/**
 * Handles the authorization by verifying the provided key.
 * @param authorization - The authorization key.
 * @returns The username if authorized, otherwise false.
 */
async function handleAuthorization(authorization: string | undefined) {
  if (authorization === undefined) {
    console.error("Unauthorized attemp to sendReply API.");
    return false;
  }

  const operationFromUsername = await getDisplayName(authorization);
  if (!operationFromUsername) return false;

  return operationFromUsername;
}

/**
 * Checks the validity of the provided postDocPath.
 * @param postDocPath - The document path of the post.
 * @returns True if valid, otherwise false.
 */
function checkProps(postDocPath: string) {
  if (!postDocPath) {
    console.error("postDocPath is undefined.");
    return false;
  }
  return true;
}

/**
 * Retrieves the post data from Firestore.
 * @param postDocPath - The document path of the post.
 * @returns The post data if found, otherwise false.
 */
async function getPostData(postDocPath: string) {
  try {
    const postDocSnapshot = await firestore.doc(postDocPath).get();
    if (!postDocSnapshot.exists) {
      console.error("Post doc does not exist.");
      return false;
    }

    const postDocData = postDocSnapshot.data() as PostServerData;
    if (!postDocData) {
      console.error("Post doc data is undefined.");
      return false;
    }

    return postDocData;
  } catch (error) {
    console.error("Error while getting post data", error);
    return false;
  }
}

function isDifferentPersonThanCreator(
  postDocData: PostServerData,
  customer: string
) {
  return postDocData.senderUsername !== customer;
}

/**
 * Retrieves the Collectible document path from the post data.
 * @param postDocData - The post data.
 * @returns The Collectible document path if valid, otherwise false.
 */
function getCollectibleDocPath(postDocData: PostServerData) {
  if (!postDocData.collectibleStatus.isCollectible) {
    console.error("Post is not a collectible to buy.");
    return false;
  }

  if (!postDocData.collectibleStatus.collectibleDocPath) {
    console.error("CollectibleDoc path is undefined.");
    return false;
  }

  return postDocData.collectibleStatus.collectibleDocPath;
}

/**
 * Retrieves the Collectible data from Firestore.
 * @param collectibleDocPath - The document path of the collectible.
 * @returns The Collectible data if found, otherwise false.
 */
async function getCollectibleData(collectibleDocPath: string) {
  try {
    const collectibleDocSnapshot = await firestore
      .doc(collectibleDocPath)
      .get();
    if (!collectibleDocSnapshot.exists) {
      console.error("Collectible doc does not exist.");
      return false;
    }

    const collectibleDocData =
      collectibleDocSnapshot.data() as CollectibleDocData;
    if (!collectibleDocData) {
      console.error("Collectible doc data is undefined.");
      return false;
    }

    return collectibleDocData;
  } catch (error) {
    console.error("Error while getting collectible Doc Data", error);
    return false;
  }
}

/**
 * Checks the validity of the Collectible data.
 * @param collectibleData - The Collectible data.
 * @returns True if valid, otherwise false.
 */
function checkCollectibleData(collectibleData: CollectibleDocData) {
  if (collectibleData.stock.remainingStock <= 0) {
    console.error("Collectible stock is undefined or out of stock.");
    return false;
  }

  return true;
}

async function checkPurchasingSingleTime(
  collectibleData: CollectibleDocData,
  customer: string
) {
  try {
    const query = await firestore
      .collection(`/collectibles/${collectibleData.id}/collectors`)
      .where("username", "==", customer)
      .get();

    const size = query.size;

    if (size > 0) {
      console.error("User has already bought this collectible.");
      return false;
    }
    return true;
  } catch (error) {
    console.error("Error while checking purchasing single time", error);
    return false;
  }
}

/**
 * Retrieves the price of the Collectible.
 * @param collectibleData - The Collectible data.
 * @returns The price if valid, otherwise false.
 */
function getPrice(collectibleData: CollectibleDocData) {
  if (!collectibleData.price.price) {
    console.error("Collectible price is undefined or has an invalid value.");
    return false;
  }

  return collectibleData.price.price;
}

/**
 * Retrieves the balance of the user.
 * @param username - The username of the user.
 * @returns The balance if found, otherwise false.
 */
async function getBalance(username: string) {
  try {
    const balanceDocSnapshot = await firestore
      .doc(`users/${username}/wallet/balance`)
      .get();

    if (!balanceDocSnapshot.exists) {
      console.error("Balance doc does not exist");
      return false;
    }

    const balancdeDocData = balanceDocSnapshot.data() as BalanceDocData;

    if (!balancdeDocData) {
      console.error("Balance doc data is undefined");
      return false;
    }

    const balance = balancdeDocData.balance;

    return balance;
  } catch (error) {
    console.error("Error while getting balance", error);
    return false;
  }
}

/**
 * Checks if the user has enough money for the transaction.
 * @param balance - The user's balance.
 * @param price - The price of the Collectible.
 * @returns True if the user has enough money, otherwise false.
 */
function hasMoney(balance: number, price: number) {
  if (balance < price) {
    console.error("Not enough money to do this operation.");
    return false;
  }

  return true;
}

/**
 * Updates the balance of the user.
 * @param username - The username of the user.
 * @param price - The price of the Collectible.
 * @returns The updated balance if successful, otherwise false.
 */
async function updateBalance(username: string, price: number) {
  try {
    const balanceDocRef = firestore.doc(`users/${username}/wallet/balance`);

    await balanceDocRef.update({
      balance: FieldValue.increment(-price),
    });

    return price;
  } catch (error) {
    console.error("Error while updating balance", error);
    return false;
  }
}

/**
 * Updates the balance of the seller.
 * @param seller - The username of the seller.
 * @param price - The price of the Collectible.
 * @returns The updated balance if successful, otherwise false.
 */
async function updateBalanceOfSeller(seller: string, price: number) {
  try {
    const balanceDocRef = firestore.doc(`users/${seller}/wallet/balance`);

    await balanceDocRef.update({
      balance: FieldValue.increment(price),
    });

    return price;
  } catch (error) {
    console.error("Error while updating seller balance", error);
    return false;
  }
}

/**
 * Creates a purchase payment intent document.
 * @param username - The username of the customer.
 * @param ts - The timestamp of the transaction.
 * @param postDocPath - The document path of the post.
 * @param collectibleDocPath - The document path of the Collectible.
 * @param price - The price of the Collectible.
 * @param seller - The username of the seller.
 * @param customer - The username of the customer.
 * @returns The ID of the payment intent document if successful, otherwise false.
 */
async function createPurchasePaymentIntentDoc(
  username: string,
  ts: number,
  postDocPath: string,
  collectibleDocPath: string,
  price: number,
  seller: string,
  customer: string
) {
  const newPurchasePaymentIntentData: PurhcasePaymentIntentDocData = {
    currency: "USD",
    id: ts.toString(),
    collectibleDocPath: collectibleDocPath,
    postDocPath: postDocPath,
    price: price,
    ts: ts,
    refunded: false,
    seller: seller,
  };

  const id = ts.toString() + "-" + customer;

  try {
    await firestore
      .doc(
        `users/${username}/wallet/paymentIntents/purchasePaymentIntents/${id}`
      )
      .set(newPurchasePaymentIntentData);

    return id;
  } catch (error) {
    console.error("Error while creating purchase payment intent doc", error);
    return false;
  }
}

/**
 * Creates a sell payment intent document.
 * @param customer - The username of the customer.
 * @param ts - The timestamp of the transaction.
 * @param postDocPath - The document path of the post.
 * @param collectibleDocPath - The document path of the Collectible.
 * @param price - The price of the Collectible.
 * @returns The ID of the payment intent document if successful, otherwise false.
 */
async function createSellPaymentIntentDoc(
  customer: string,
  ts: number,
  postDocPath: string,
  collectibleDocPath: string,
  price: number,
  seller: string
) {
  const id = ts.toString() + "-" + customer;

  const newSellPaymentIntentData: SellPaymentIntentDocData = {
    currency: "USD",
    id: id,
    collectibleDocPath: collectibleDocPath,
    postDocPath: postDocPath,
    price: price,
    ts: ts,
    refunded: false,
    customer: customer,
  };

  try {
    await firestore
      .doc(`users/${seller}/wallet/paymentIntents/sellPaymentIntents/${id}`)
      .set(newSellPaymentIntentData);

    return id;
  } catch (error) {
    console.error("Error while creating sell payment intent doc", error);
    return false;
  }
}

/**
 * Updates the Collectible document with the new buyer and stock information.
 * @param collectibleDocPath - The document path of the collectibleDocPath.
 * @param username - The username of the new owner.
 * @returns The updated document if successful, otherwise false.
 */
async function updateCollectibleDoc(
  collectibleDocPath: string,
  username: string
) {
  try {
    const collectibleDocRef = firestore.doc(collectibleDocPath);

    await collectibleDocRef.update({
      "stock.remainingStock": FieldValue.increment(-1),
    });

    return {
      username: username,
      collectibleDocPath: collectibleDocPath,
    };
  } catch (error) {
    console.error("Error while updating collectible doc", error);
    return false;
  }
}

async function addCollectorDocToCollectorsCollection(
  collectibleDocPath: string,
  collectorDocData: CollectorDocData
) {
  try {
    const collectorDocRef = firestore.collection(
      `${collectibleDocPath}/collectors`
    );
    await collectorDocRef.add(collectorDocData);
    return collectorDocRef.path;
  } catch (error) {
    console.error("Error while adding collector doc", error);
    return false;
  }
}

async function addBoughtCollectibleDocToBuyer(
  customer: string,
  postDocPath: string,
  collectibleDocPath: string,
  ts: number
) {
  const newDocData: BoughtCollectibleDocData = {
    collectibleDocPath: collectibleDocPath,
    postDocPath: postDocPath,
    ts: ts,
  };

  try {
    const collectionRef = firestore.collection(
      `users/${customer}/collectible/trade/boughtCollectibles`
    );

    const createdDocRef = await collectionRef.add(newDocData);

    return createdDocRef;
  } catch (error) {
    console.error("Error while adding bought collectible doc", error);
    return false;
  }
}

async function addSoldCollectibleDocToSeller(
  seller: string,
  collectibleDocPath: string,
  postDocPath: string,
  ts: number,
  customer: string
) {
  const newData: SoldCollectibleDocData = {
    collectibleDocPath: collectibleDocPath,
    postDocPath: postDocPath,
    ts: ts,
    username: customer,
  };

  try {
    const collectionRef = firestore.collection(
      `users/${seller}/collectible/trade/soldCollectibles`
    );
    const createdDocRef = await collectionRef.add(newData);
    return createdDocRef;
  } catch (error) {
    console.error("Error while adding sold collectible doc", error);
    return false;
  }
}

/**
 * Rolls back the transaction by reverting all changes.
 * @param username - The username of the buyer.
 * @param seller - The username of the seller.
 * @param updateBalanceResult - The result of updating the buyer's balance.
 * @param updateBalanceOfSellerResult - The result of updating the seller's balance.
 * @param createPurchasePaymentIntentDocResult - The result of creating the purchase payment intent document.
 * @param createSellPaymentIntentDocResult - The result of creating the sell payment intent document.
 * @param updateCollectibleDocResult - The result of updating the Collectible document.
 * @param updateCollectibleTradeDocOfBuyerResult - The result of updating the buyer's Collectible trade document.
 * @param updateCollectibleTradeDocOfSellerResult - The result of updating the seller's Collectible trade document.
 * @returns A promise that resolves when the rollback is complete.
 */
async function rollback(
  customer: string,
  seller: string,
  updateBalanceResult: false | number,
  updateBalanceOfSellerResult: false | number,
  createPurchasePaymentIntentDocResult: string | false,
  createSellPaymentIntentDocResult: string | false,
  updateCollectibleDocResult:
    | false
    | {
        collectibleDocPath: string;
      },
  addBoughtCollectibleDocToBuyerResult:
    | false
    | FirebaseFirestore.DocumentReference<
        FirebaseFirestore.DocumentData,
        FirebaseFirestore.DocumentData
      >,
  addSoldCollectibleDocToSellerResult:
    | false
    | FirebaseFirestore.DocumentReference<
        FirebaseFirestore.DocumentData,
        FirebaseFirestore.DocumentData
      >,
  addCollectorDocToCollectorsCollectionResult: false | string
) {
  if (updateBalanceResult) {
    const updateBalanceRollback = await updateBalance(
      customer,
      -updateBalanceResult
    );

    if (!updateBalanceRollback) {
      console.error("updateBalanceRollback FAILED");
    }
  }

  if (updateBalanceOfSellerResult) {
    const updateBalanceOfSellerRollback = await updateBalanceOfSeller(
      seller,
      -updateBalanceOfSellerResult
    );

    if (!updateBalanceOfSellerRollback) {
      console.error("updateBalanceOfSellerRollback FAILED");
    }
  }

  if (createPurchasePaymentIntentDocResult) {
    try {
      const purchasePaymentIntentDocRef = firestore.doc(
        `users/${customer}/wallet/paymentIntents/purchasePaymentIntents/${createPurchasePaymentIntentDocResult}`
      );
      await purchasePaymentIntentDocRef.delete();
    } catch (error) {
      console.error(
        "Error while rolling back purchase payment intent doc",
        error
      );
    }
  }

  if (createSellPaymentIntentDocResult) {
    try {
      const sellPaymentIntentDocRef = firestore.doc(
        `users/${seller}/wallet/paymentIntents/sellPaymentIntents/${createSellPaymentIntentDocResult}`
      );
      await sellPaymentIntentDocRef.delete();
    } catch (error) {
      console.error("Error while rolling back sell payment intent doc", error);
    }
  }

  if (updateCollectibleDocResult) {
    try {
      const collectibleDocRef = firestore.doc(
        updateCollectibleDocResult.collectibleDocPath
      );
      await collectibleDocRef.update({
        "stock.remainingStock": FieldValue.increment(1),
      });
    } catch (error) {
      console.error("Error while rolling back collectible doc", error);
    }
  }

  if (addBoughtCollectibleDocToBuyerResult) {
    try {
      await addBoughtCollectibleDocToBuyerResult.delete();
    } catch (error) {
      console.error("Error while rolling back bought collectible doc. ", error);
    }
  }

  if (addSoldCollectibleDocToSellerResult) {
    try {
      await addSoldCollectibleDocToSellerResult.delete();
    } catch (error) {
      console.error(
        "Error while rolling back collectible trade doc of seller",
        error
      );
    }
  }

  if (addCollectorDocToCollectorsCollectionResult) {
    try {
      const collectorDocRef = firestore.doc(
        addCollectorDocToCollectorsCollectionResult
      );
      await collectorDocRef.delete();
    } catch (error) {
      console.error("Error while rolling back collector doc", error);
    }
  }
}

function createNotificationObject(
  postDocPath: string,
  price: number,
  customer: string,
  seller: string
) {
  const notificationObject: ReceivedNotificationDocData = {
    type: "collectibleBought",
    params: {
      collectiblePostDocPath: postDocPath,
      currency: "USD",
      price: price,
    },
    source: customer,
    target: seller,
    timestamp: Date.now(),
  };

  return notificationObject;
}

async function sendNotification(
  notificationObject: ReceivedNotificationDocData
) {
  if (!configObject) {
    console.error("Config object is undefined.");
    return false;
  }

  const notificationAPIKey = configObject.NOTIFICATION_API_KEY;

  if (!notificationAPIKey) {
    console.error("Notification API key is undefined from config file.");
    return false;
  }

  try {
    const response = await fetch(
      internalAPIRoutes.notification.sendNotification,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          authorization: notificationAPIKey,
        },
        body: JSON.stringify({
          notificationData: notificationObject,
        }),
      }
    );

    if (!response.ok) {
      console.error(
        "Notification API response is not okay: ",
        await response.text()
      );
      return false;
    }

    return true;
  } catch (error) {
    console.error("Error while sending notification: ", error);
    return false;
  }
}

export const buyCollectible = onRequest(
  appCheckMiddleware(async (req, res) => {
    const { authorization } = req.headers;
    const { postDocPath } = req.body;

    const username = await handleAuthorization(authorization);
    if (!username) {
      res.status(401).send("Unauthorized");
      return;
    }

    const checkPropsResult = checkProps(postDocPath);
    if (!checkPropsResult) {
      res.status(422).send("Invalid Request");
      return;
    }

    const postData = await getPostData(postDocPath);
    if (!postData) {
      res.status(422).send("Invalid Request");
      return;
    }

    if (!isDifferentPersonThanCreator(postData, username)) {
      res.status(403).send("Forbidden");
      return;
    }

    const collectibleDocPath = getCollectibleDocPath(postData);
    if (!collectibleDocPath) {
      res.status(422).send("Invalid Request");
      return;
    }

    const collectibleData = await getCollectibleData(collectibleDocPath);
    if (!collectibleData) {
      res.status(422).send("Invalid Request");
      return;
    }

    const checkCollectibleDataResult = checkCollectibleData(collectibleData);
    if (!checkCollectibleDataResult) {
      res.status(422).send("Invalid Request");
      return;
    }

    const checkPurchasingSingleTimeResult = await checkPurchasingSingleTime(
      collectibleData,
      username
    );
    if (!checkPurchasingSingleTimeResult) {
      res.status(403).send("Forbidden");
      return;
    }

    const price = getPrice(collectibleData);
    if (!price) {
      res.status(422).send("Invalid Request");
      return;
    }

    const balance = await getBalance(username);
    if (balance === false) {
      res.status(500).send("Internal Server Error");
      return;
    }

    const hasMoneyResult = hasMoney(balance, price);
    if (!hasMoneyResult) {
      res.status(403).send("Forbidden");
      return;
    }

    const commonTimestamp = Date.now();

    const [
      updateBalanceResult,
      updateBalanceOfSellerResult,
      createPurchasePaymentIntentDocResult,
      createSellPaymentIntentDocResult,
      updateCollectibleDocResult,
      addBoughtCollectibleDocToBuyerResult,
      addSoldCollectibleDocToSellerResult,
      addCollectorDocToCollectorsCollectionResult,
    ] = await Promise.all([
      updateBalance(username, price),
      updateBalanceOfSeller(postData.senderUsername, price),
      createPurchasePaymentIntentDoc(
        username,
        commonTimestamp,
        postDocPath,
        collectibleDocPath,
        price,
        postData.senderUsername,
        username
      ),
      createSellPaymentIntentDoc(
        username,
        commonTimestamp,
        postDocPath,
        collectibleDocPath,
        price,
        postData.senderUsername
      ),
      updateCollectibleDoc(collectibleDocPath, username),
      addBoughtCollectibleDocToBuyer(
        username,
        postDocPath,
        collectibleDocPath,
        commonTimestamp
      ),
      addSoldCollectibleDocToSeller(
        postData.senderUsername,
        collectibleDocPath,
        postDocPath,
        commonTimestamp,
        username
      ),
      addCollectorDocToCollectorsCollection(collectibleDocPath, {
        timestamp: commonTimestamp,
        username: username,
      }),
    ]);
    if (
      !updateBalanceResult ||
      !updateBalanceOfSellerResult ||
      !createPurchasePaymentIntentDocResult ||
      !createSellPaymentIntentDocResult ||
      !updateCollectibleDocResult ||
      !addBoughtCollectibleDocToBuyerResult ||
      !addSoldCollectibleDocToSellerResult ||
      !addCollectorDocToCollectorsCollectionResult
    ) {
      await rollback(
        username,
        postData.senderUsername,
        updateBalanceResult,
        updateBalanceOfSellerResult,
        createPurchasePaymentIntentDocResult,
        createSellPaymentIntentDocResult,
        updateCollectibleDocResult,
        addBoughtCollectibleDocToBuyerResult,
        addSoldCollectibleDocToSellerResult,
        addCollectorDocToCollectorsCollectionResult
      );
      res.status(500).send("Internal Server Error");
      return;
    }

    const notificationObject = createNotificationObject(
      postDocPath,
      price,
      username,
      postData.senderUsername
    );
    const notificationResult = await sendNotification(notificationObject);
    if (!notificationResult) {
      console.error(
        "Notification result is false on buying collectibe... See above logs. (non-fatal)."
      );
    }

    res.status(200).send("Successsfull paymaent handled correctly.");
    return;
  })
);
