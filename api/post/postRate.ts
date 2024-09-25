import {FieldValue} from "firebase-admin/firestore";
import {onRequest} from "firebase-functions/v2/https";
import {internalAPIRoutes} from "../../config";
import {getConfigObject} from "../../configs/getConfigObject";
import {firestore} from "../../firebase/adminApp";
import getDisplayName from "../../helpers/getDisplayName";
import {appCheckMiddleware} from "../../middleware/appCheckMiddleware";
import {ReceivedNotificationDocData} from "../../types/Notifications";
import {PostServerData, RatingData} from "../../types/Post";
import {RateInteractionDocData} from "@/types/Interactions";

const configObject = getConfigObject();

if (!configObject) {
  throw new Error("Config object is undefined");
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

function checkProps(rating: number, postDocPath: string) {
  if (!postDocPath) return false;
  if (rating < 1 || rating > 5) return false;

  return true;
}

async function getPostSenderUsername(postDocPath: string) {
  try {
    const postDocSnapshot = await firestore.doc(postDocPath).get();

    if (!postDocSnapshot.exists) {
      console.error("Post doc does not exist: ", postDocPath);
      return false;
    }

    const postDocData = postDocSnapshot.data() as PostServerData;
    return postDocData.senderUsername;
  } catch (error) {
    console.error("Error while getting post sender username: ", error);
    return false;
  }
}

/**
 *
 * @param postDocPath
 * @param username
 * @returns
 */
async function checkForPreviousRating(
  postDocPath: string,
  username: string
): Promise<
  | { isTherePreviousRating: false }
  | {
      isTherePreviousRating: true;
      previousRatingDocPath: string;
      previousRatingDocData: RatingData;
    }
  | false
> {
  try {
    const query = await firestore
      .doc(postDocPath)
      .collection("ratings")
      .where("sender", "==", username)
      .get();

    if (query.empty) {
      return {
        isTherePreviousRating: false,
      };
    }

    const data = query.docs[0].data() as RatingData;

    return {
      isTherePreviousRating: true,
      previousRatingDocPath: query.docs[0].ref.path,
      previousRatingDocData: data,
    };
  } catch (error) {
    console.error("Error while checking for previous rating: ", error);
    return false;
  }
}

async function updatePreviousRatingDoc(
  previousRatingDocPath: string,
  newRatingData: RatingData
) {
  try {
    await firestore.doc(previousRatingDocPath).set(newRatingData);
    return true;
  } catch (error) {
    console.error("Error while updating previous rating doc: ", error);
    return false;
  }
}

async function createRatingDoc(postDocPath: string, newRatingData: RatingData) {
  try {
    await firestore.doc(postDocPath).collection("ratings").add(newRatingData);
    return true;
  } catch (error) {
    console.error("Error while creating rating doc: ", error);
    return false;
  }
}

async function handleRatingDoc(
  postDocPath: string,
  username: string,
  newRating: number,
  commonTimestamp: number,
  checkForPreviousRatingResult:
    | { isTherePreviousRating: false }
    | {
        isTherePreviousRating: true;
        previousRatingDocPath: string;
        previousRatingDocData: RatingData;
      }
) {
  if (checkForPreviousRatingResult.isTherePreviousRating) {
    const updatePreviousRatingDocResult = await updatePreviousRatingDoc(
      checkForPreviousRatingResult.previousRatingDocPath,
      {
        ...checkForPreviousRatingResult.previousRatingDocData,
        rating: newRating,
        timestamp: commonTimestamp,
      }
    );

    if (!updatePreviousRatingDocResult) return false;
    return true;
  }

  const newRatingData: RatingData = {
    rating: newRating,
    sender: username,
    timestamp: commonTimestamp,
  };

  const createRatingDocResult = await createRatingDoc(
    postDocPath,
    newRatingData
  );

  if (!createRatingDocResult) return false;
  return true;
}

async function updatePostDoc(
  postDocPath: string,
  previousRating: number,
  newRating: number
) {
  try {
    await firestore.doc(postDocPath).update({
      ratingSum: FieldValue.increment(newRating - previousRating),
      ratingCount: previousRating ?
        FieldValue.increment(0) :
        FieldValue.increment(1),
    });
    return true;
  } catch (error) {
    console.error("Error while updating post doc: ", error);
    return false;
  }
}

function createNotificationObject(
  rate: number,
  postDocPath: string,
  rateSender: string,
  postSender: string,
  timestamp: number
) {
  const notificationObject: ReceivedNotificationDocData = {
    type: "ratePost",
    params: {
      rate: rate,
      ratedPostDocPath: postDocPath,
    },
    source: rateSender,
    target: postSender,
    timestamp: timestamp,
  };
  return notificationObject;
}

async function sendNotification(
  rate: number,
  postDocPath: string,
  rateSender: string,
  postSender: string,
  timestamp: number
) {
  if (rateSender === postSender) return true;

  const notificationObject = createNotificationObject(
    rate,
    postDocPath,
    rateSender,
    postSender,
    timestamp
  );

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

async function addRateInteractionDoc(
  username: string,
  rateInteractionDocData: RateInteractionDocData
) {
  try {
    const rateInteractionsCollectionRef = firestore.collection(
      `users/${username}/personal/postInteractions/rates`
    );
    await rateInteractionsCollectionRef.add(rateInteractionDocData);
    return true;
  } catch (error) {
    console.error("Error while adding rate interaction doc: ", error);
    return false;
  }
}

async function updateRateInteractionDoc(
  username: string,
  postDocPath: string,
  newRate: number,
  ts: number
) {
  const newData: RateInteractionDocData = {
    postDocPath: postDocPath,
    rate: newRate,
    creationTime: ts,
  };

  try {
    const query = await firestore
      .collection(`users/${username}/personal/postInteractions/rates`)
      .where("postDocPath", "==", postDocPath)
      .get();
    if (query.empty) {
      console.error("No rate interaction doc data to update.");
      return true;
    }
    const doc = query.docs[0].ref;
    await doc.update(newData);
    return true;
  } catch (error) {
    console.error("Error while updating rate interaction doc: ", error);
    return false;
  }
}

async function handleInteraction(
  hasPreviousRating: boolean,
  username: string,
  postDocPath: string,
  ts: number,
  rate: number
) {
  if (hasPreviousRating) {
    return await updateRateInteractionDoc(username, postDocPath, rate, ts);
  }

  return await addRateInteractionDoc(username, {
    creationTime: ts,
    postDocPath: postDocPath,
    rate: rate,
  });
}

async function deleteNotification(
  postDocPath: string,
  rateSender: string,
  postSender: string,
  previousRatingDocData: undefined | RatingData
) {
  if (rateSender === postSender) return true;
  if (!previousRatingDocData) return true;

  const notificationObject = createNotificationObject(
    previousRatingDocData.rating,
    postDocPath,
    rateSender,
    postSender,
    previousRatingDocData.timestamp
  );

  if (!configObject) {
    console.error("Config object is undefined.");
    return false;
  }

  const notificationAPIKey = configObject.NOTIFICATION_API_KEY;

  if (!notificationAPIKey) {
    console.error("Notification API key is undefined fron config file.");
    return false;
  }

  try {
    const response = await fetch(
      internalAPIRoutes.notification.deleteNotification,
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
        "Delete Notification API response is not okay: ",
        await response.text()
      );
      return false;
    }

    return true;
  } catch (error) {
    console.error("Error while deleting notification: ", error);
    return false;
  }
}

async function handleNotification(
  rate: number,
  postDocPath: string,
  rateSender: string,
  timestamp: number,
  previousRatingResult: undefined | RatingData
) {
  const postSender = await getPostSenderUsername(postDocPath);
  if (!postSender) return false;

  const [sendNotificationResult, removeNotificationResult] = await Promise.all([
    sendNotification(rate, postDocPath, rateSender, postSender, timestamp),
    deleteNotification(
      postDocPath,
      rateSender,
      postSender,
      previousRatingResult
    ),
  ]);

  return sendNotificationResult && removeNotificationResult;
}

const delay = (ms: number) => {
  return new Promise((resolve) => setTimeout(resolve, ms));
};

export const postRate = onRequest(
  appCheckMiddleware(async (req, res) => {
    const {authorization} = req.headers;
    const {rating, postDocPath} = req.body;

    const username = await handleAuthorization(authorization);
    if (!username) {
      res.status(401).send("Unauthorized");
      return;
    }

    const checkPropsResult = checkProps(rating, postDocPath);
    if (!checkPropsResult) {
      res.status(422).send("Invalid Request");
      return;
    }

    const checkForPreviousRatingResult = await checkForPreviousRating(
      postDocPath,
      username
    );
    if (!checkForPreviousRatingResult) {
      res.status(500).send("Internal Server Error");
      return;
    }

    const commonTimestamp = Date.now();

    updatePostDoc(
      postDocPath,
      checkForPreviousRatingResult.isTherePreviousRating ?
        checkForPreviousRatingResult.previousRatingDocData.rating :
        0,
      rating
    );

    handleRatingDoc(
      postDocPath,
      username,
      rating,
      commonTimestamp,
      checkForPreviousRatingResult
    );

    handleInteraction(
      checkForPreviousRatingResult.isTherePreviousRating,
      username,
      postDocPath,
      commonTimestamp,
      rating
    );

    handleNotification(
      rating,
      postDocPath,
      username,
      commonTimestamp,
      checkForPreviousRatingResult.isTherePreviousRating ?
        checkForPreviousRatingResult.previousRatingDocData :
        undefined
    );

    // Ensure all request have been sent.
    await delay(250);

    res.status(200).send("Success");

    return;
  })
);
