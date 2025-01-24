import {FieldValue} from "firebase-admin/firestore";
import {onRequest} from "firebase-functions/https";
import {getConfigObject} from "../../../configs/getConfigObject";
import {firestore} from "../../../firebase/adminApp";
import getDisplayName from "../../../helpers/getDisplayName";
import {internalAPIRoutes} from "../../../helpers/internalApiRoutes";
import {appCheckMiddleware} from "../../../middleware/appCheckMiddleware";
import {
  CodeDocData,
  CollectedCollectibleDocData,
  CollectibleDocData,
  CollectorDocData,
} from "../../../types/Collectible";
import {ReceivedNotificationDocData} from "../../../types/Notifications";
import {NewPostDocData} from "../../../types/Post";
import {
  BoughtCollectibleDocData,
  PurhcasePaymentIntentDocData,
  SellPaymentIntentDocData,
  SoldCollectibleDocData,
} from "../../../types/Trade";
import AsyncLock = require("async-lock");

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
    console.error("Unauthorized.");
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
function checkProps(code: string) {
  if (!code) {
    console.error("code is undefined.");
    return false;
  }
  return true;
}

async function checkAndUpdateCodeDoc(code: string, collectorUsername: string) {
  try {
    const codeDoc = await firestore.doc(`collectibleCodes/${code}`).get();

    if (!codeDoc.exists) {
      console.error("Code doesn't exist.");
      return "Invalid Code";
    }

    const data = codeDoc.data() as CodeDocData;
    if (!data) {
      console.error("Code data is undefined.");
      return "Server Problem";
    }

    if (data.isConsumed) {
      console.error("Code is already consumed.");
      return "Code Used.";
    }

    const updatedData: CodeDocData = {
      ...data,
      isConsumed: true,
      consumedTime: Date.now(),
      consumerUsername: collectorUsername,
    };

    await codeDoc.ref.set(updatedData);

    return updatedData;
  } catch (error) {
    console.error("Error while checking and updating code", error);
    return "Server Problem";
  }
}

async function rollbackCheckAndUpdateCodeDoc(code: string) {
  try {
    const codeDocRef = firestore.doc(`collectibleCodes/${code}`);

    await codeDocRef.update({
      isConsumed: false,
      consumerUsername: FieldValue.delete(),
      consumedTime: FieldValue.delete(),
    });
    return true;
  } catch (error) {
    console.error("Error while rolling back code doc", error);
    return false;
  }
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

    const postDocData = postDocSnapshot.data() as NewPostDocData;
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
  postDocData: NewPostDocData,
  customer: string
) {
  return postDocData.senderUsername !== customer;
}

/**
 * Retrieves the Collectible document path from the post data.
 * @param postDocData - The post data.
 * @returns The Collectible document path if valid, otherwise false.
 */
function getCollectibleDocPath(postDocData: NewPostDocData) {
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

function checkCollectibleType(collectibleDocData: CollectibleDocData) {
  if (collectibleDocData.type !== "event") {
    console.error("Collectible type is not event.");
    return false;
  }
  return true;
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
  collector: string,
  ts: number,
  postDocPath: string,
  collectibleDocPath: string,
  seller: string
) {
  const newPurchasePaymentIntentData: PurhcasePaymentIntentDocData = {
    currency: "USD",
    id: ts.toString(),
    collectibleDocPath: collectibleDocPath,
    postDocPath: postDocPath,
    price: 0,
    ts: ts,
    refunded: false,
    seller: seller,
  };

  const id = ts.toString() + "-" + collector;

  try {
    await firestore
      .doc(
        `users/${collector}/wallet/paymentIntents/purchasePaymentIntents/${id}`
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
  seller: string
) {
  const id = ts.toString() + "-" + customer;

  const newSellPaymentIntentData: SellPaymentIntentDocData = {
    currency: "USD",
    id: id,
    collectibleDocPath: collectibleDocPath,
    postDocPath: postDocPath,
    price: 0,
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
 * Updates the collectible document with the stock information.
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

/**
 * @returns Path of newly created doc.
 */
async function addDocToCollectedCollectiblesCollection(
  collectibleDocPath: string,
  postDocPath: string,
  timestamp: number,
  rank: number,
  creatorUsername: string,
  collectorUsername: string
) {
  const newDocData: CollectedCollectibleDocData = {
    collectibleDocPath: collectibleDocPath,
    postDocPath: postDocPath,
    collectorUsername: collectorUsername,
    creatorUsername: creatorUsername,
    id: "", // This should be generated
    rank: rank,
    timestamp: timestamp,
    type: "event",
    docPath: "", // This should be generated
  };

  try {
    const collectionRef = firestore.collection("collectedCollectibles");

    const newDocRef = await collectionRef.add(newDocData);

    await newDocRef.update({
      id: newDocRef.id,
      docPath:
        newDocRef.path[0] === "/" ? newDocRef.path.slice(1) : newDocRef.path,
    });

    return newDocRef.path;
  } catch (error) {
    console.error(
      "Error while adding doc to collected collectibles collection"
    );
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

async function addCollectorDocToCollectorsCollection(
  collectibleDocPath: string,
  collectorDocData: CollectorDocData
) {
  try {
    const collectorDocRef = firestore.collection(
      `${collectibleDocPath}/collectors`
    );
    const {path} = await collectorDocRef.add(collectorDocData);
    return path;
  } catch (error) {
    console.error("Error while adding collector doc", error);
    return false;
  }
}

async function updateUserCollectibleCount(
  username: string,
  isRollback?: boolean
) {
  try {
    const userDocRef = firestore.doc(`users/${username}`);

    await userDocRef.update({
      collectibleCount: FieldValue.increment(isRollback ? -1 : 1),
    });

    return true;
  } catch (error) {
    console.error("Error while updating user collectible count", error);
    return false;
  }
}

function createNotificationObject(
  postDocPath: string,
  customer: string,
  seller: string
) {
  const notificationObject: ReceivedNotificationDocData = {
    type: "collectibleBought",
    params: {
      collectiblePostDocPath: postDocPath,
      currency: "USD",
      price: 0,
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
          "authorization": notificationAPIKey,
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

async function rollback(
  customer: string,
  seller: string,
  createPurchasePaymentIntentDocResult: string | false,
  createSellPaymentIntentDocResult: string | false,
  updateCollectibleDocResult:
    | false
    | {
        collectibleDocPath: string;
      },
  addDocToCollectedCollectiblesCollectionResult: false | string,
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
  addCollectorDocToCollectorsCollectionResult: false | string,
  updateUserCollectibleCountResult: boolean
) {
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

  if (addDocToCollectedCollectiblesCollectionResult) {
    try {
      const collectedCollectibleDocRef = firestore.doc(
        addDocToCollectedCollectiblesCollectionResult
      );
      await collectedCollectibleDocRef.delete();
    } catch (error) {
      console.error(
        "Error while rolling back collected collectible doc",
        error
      );
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

  if (updateUserCollectibleCountResult) {
    try {
      await updateUserCollectibleCount(customer, true);
    } catch (error) {
      console.error("Error while rolling back user collectible count", error);
    }
  }
}

async function processCollecting(
  code: string,
  authorization: string | undefined
) {
  const collectorUsername = await handleAuthorization(authorization);
  if (!collectorUsername) {
    throw new Error("Unauthorized");
  }

  if (!checkProps(code)) {
    throw new Error("Invalid Props");
  }

  const codeData = await checkAndUpdateCodeDoc(code, collectorUsername);
  if (
    codeData === "Code Used." ||
    codeData === "Invalid Code" ||
    codeData === "Server Problem"
  ) {
    throw new Error(codeData);
  }

  const postDocPath = codeData.postDocPath;

  const postData = await getPostData(postDocPath);
  if (!postData) {
    await rollbackCheckAndUpdateCodeDoc(code);
    throw new Error("Post not found");
  }

  if (!isDifferentPersonThanCreator(postData, collectorUsername)) {
    await rollbackCheckAndUpdateCodeDoc(code);
    throw new Error("Forbidden.");
  }

  const collectibleDocPath = getCollectibleDocPath(postData);
  if (!collectibleDocPath) {
    await rollbackCheckAndUpdateCodeDoc(code);
    throw new Error("Collectible not found");
  }

  const collectibleData = await getCollectibleData(collectibleDocPath);
  if (!collectibleData) {
    await rollbackCheckAndUpdateCodeDoc(code);
    throw new Error("Collectible not found");
  }

  if (!checkCollectibleType(collectibleData)) {
    await rollbackCheckAndUpdateCodeDoc(code);
    throw new Error("Forbidden");
  }

  if (!checkCollectibleData(collectibleData)) {
    await rollbackCheckAndUpdateCodeDoc(code);
    throw new Error("Forbidden");
  }

  const isPurchasingSingleTime = await checkPurchasingSingleTime(
    collectibleData,
    collectorUsername
  );
  if (!isPurchasingSingleTime) {
    await rollbackCheckAndUpdateCodeDoc(code);
    throw new Error("Forbidden");
  }

  const creator = postData.senderUsername;
  const commonTimestamp = Date.now();

  const [
    createPurchasePaymentIntentDocResult,
    createSellPaymentIntentDocResult,
    updateCollectibleDocResult,
    addDocToCollectedCollectiblesCollectionResult,
    addBoughtCollectibleDocToBuyerResult,
    addSoldCollectibleDocToSellerResult,
    addCollectorDocToCollectorsCollectionResult,
    updateUserCollectibleCountResult,
  ] = await Promise.all([
    createPurchasePaymentIntentDoc(
      collectorUsername,
      commonTimestamp,
      postDocPath,
      collectibleDocPath,
      creator
    ),
    createSellPaymentIntentDoc(
      collectorUsername,
      commonTimestamp,
      postDocPath,
      collectibleDocPath,
      creator
    ),
    updateCollectibleDoc(collectibleDocPath, collectorUsername),
    addDocToCollectedCollectiblesCollection(
      collectibleDocPath,
      postDocPath,
      commonTimestamp,
      collectibleData.stock.initialStock -
        collectibleData.stock.remainingStock +
        1,
      creator,
      collectorUsername
    ),
    addBoughtCollectibleDocToBuyer(
      collectorUsername,
      postDocPath,
      collectibleDocPath,
      commonTimestamp
    ),

    addSoldCollectibleDocToSeller(
      creator,
      collectibleDocPath,
      postDocPath,
      commonTimestamp,
      collectorUsername
    ),

    addCollectorDocToCollectorsCollection(collectibleDocPath, {
      timestamp: commonTimestamp,
      username: collectorUsername,
    }),

    updateUserCollectibleCount(collectorUsername),
  ]);

  if (
    !createPurchasePaymentIntentDocResult ||
    !createSellPaymentIntentDocResult ||
    !updateCollectibleDocResult ||
    !addDocToCollectedCollectiblesCollectionResult ||
    !addBoughtCollectibleDocToBuyerResult ||
    !addSoldCollectibleDocToSellerResult ||
    !addCollectorDocToCollectorsCollectionResult ||
    !updateUserCollectibleCountResult
  ) {
    await rollbackCheckAndUpdateCodeDoc(code);
    await rollback(
      collectorUsername,
      postData.senderUsername,
      createPurchasePaymentIntentDocResult,
      createSellPaymentIntentDocResult,
      updateCollectibleDocResult,
      addDocToCollectedCollectiblesCollectionResult,
      addBoughtCollectibleDocToBuyerResult,
      addSoldCollectibleDocToSellerResult,
      addCollectorDocToCollectorsCollectionResult,
      updateUserCollectibleCountResult
    );
    throw new Error("Server Problem");
  }

  const notificationObject = createNotificationObject(
    postDocPath,
    collectorUsername,
    postData.senderUsername
  );

  const notificationResult = await sendNotification(notificationObject);
  if (!notificationResult) {
    throw new Error("Internal Server Error: Notification can not be sent.");
  }

  return addDocToCollectedCollectiblesCollectionResult;
}

const lock = new AsyncLock();

export const collectCollectible = onRequest(
  appCheckMiddleware(async (req, res) => {
    const {authorization} = req.headers;
    const {code} = req.body;

    const lockId = `collectCollectible-${code}`;

    try {
      await lock.acquire(lockId, async () => {
        const newCollectedDocPath = await processCollecting(
          code,
          authorization
        );
        res.status(200).send({
          collectedDocPath: newCollectedDocPath,
        });
      });
    } catch (error) {
      console.error("Error on collection of event based collectible: ", error);
      res.status(400).send(`${error}`);
    }
  })
);
