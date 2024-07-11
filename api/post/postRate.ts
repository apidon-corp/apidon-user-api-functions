import { onRequest } from "firebase-functions/v2/https";
import getDisplayName from "../../helpers/getDisplayName";
import { PostServerDataV3, RateData } from "../../types/Post";
import { firestore } from "../../firebase/adminApp";
import { FieldValue } from "firebase-admin/firestore";
import { NotificationData } from "../../types/Notifications";
import { internalAPIRoutes, keys } from "../../config";

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

async function checkPreviousRating(username: string, postDocPath: string) {
  try {
    const postDocSnapshot = await firestore.doc(postDocPath).get();
    if (!postDocSnapshot.exists) {
      console.error("Post doc doesn't exist.");
      return false;
    }

    const postDocData = postDocSnapshot.data() as PostServerDataV3;
    if (!postDocData) {
      console.error("Post doc data doesn't exist.");
      return false;
    }

    const previousRateObject = postDocData.rates.find(
      (r) => r.sender === username
    );

    return {
      previousRateObject: previousRateObject,
      postDocData: postDocData,
    };
  } catch (error) {
    console.error(
      "Error while checking previous rating for post: ",
      postDocPath,
      "\nError: ",
      error
    );
    return false;
  }
}

async function deletePreviousRating(
  postDocPath: string,
  previousRateObject: RateData | undefined
) {
  if (!previousRateObject) return true;

  try {
    const postDocRef = firestore.doc(postDocPath);

    await postDocRef.update({
      rates: FieldValue.arrayRemove(previousRateObject),
    });

    return true;
  } catch (error) {
    console.error(
      "Error while deleting previous rating for post: ",
      postDocPath,
      "\nError: ",
      error
    );
    return false;
  }
}

async function addNewRating(postDocPath: string, rating: RateData) {
  try {
    const postDocRef = firestore.doc(postDocPath);

    await postDocRef.update({
      rates: FieldValue.arrayUnion(rating),
    });

    return true;
  } catch (error) {
    console.error(
      "Error while adding new rating for post: ",
      postDocPath,
      "\nError: ",
      error
    );
    return false;
  }
}

async function updatePostDoc(
  username: string,
  postDocPath: string,
  rate: number,
  previousRateObject: RateData | undefined,
  timestamp: number
) {
  const deletePreviousRatingResult = await deletePreviousRating(
    postDocPath,
    previousRateObject
  );

  if (!deletePreviousRatingResult) return false;

  const newRatingData: RateData = {
    rate: rate,
    sender: username,
    ts: timestamp,
  };

  const addNewRatingResult = await addNewRating(postDocPath, newRatingData);
  if (!addNewRatingResult) return false;

  return true;
}

function createNotificationObject(
  rate: number,
  postDocPath: string,
  rateSender: string,
  postSender: string,
  timestamp: number
) {
  const notificationObject: NotificationData = {
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

  const notificationAPIKey = keys.NOTIFICATION_API_KEY;

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

async function deleteNotification(
  postDocPath: string,
  rateSender: string,
  postSender: string,
  previousRatingResult: undefined | RateData
) {
  if (rateSender === postSender) return true;
  if (!previousRatingResult) return true;

  const notificationObject = createNotificationObject(
    previousRatingResult.rate,
    postDocPath,
    rateSender,
    postSender,
    previousRatingResult.ts
  );

  const notificationAPIKey = keys.NOTIFICATION_API_KEY;

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
          authorization: notificationAPIKey,
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
  postSender: string,
  timestamp: number,
  previousRatingResult: undefined | RateData
) {
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

export const postRate = onRequest(async (req, res) => {
  const { authorization } = req.headers;
  const { rating, postDocPath } = req.body;

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

  const previousRatingResult = await checkPreviousRating(username, postDocPath);
  if (previousRatingResult === false) {
    res.status(500).send("Internal Server Error");
    return;
  }

  const ts = Date.now();

  const updatePostDocResult = await updatePostDoc(
    username,
    postDocPath,
    rating,
    previousRatingResult.previousRateObject,
    ts
  );

  if (!updatePostDocResult) {
    res.status(500).send("Internal Server Error");
    return;
  }

  const notificationResult = await handleNotification(
    rating,
    postDocPath,
    username,
    previousRatingResult.postDocData.senderUsername,
    ts,
    previousRatingResult.previousRateObject
  );

  if (!notificationResult) {
    res.status(500).send("Internal Server Error");
    return;
  }

  res.status(200).send("Success");

  return;
});
