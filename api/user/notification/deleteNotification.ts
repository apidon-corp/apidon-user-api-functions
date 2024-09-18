import { onRequest } from "firebase-functions/v2/https";

import { firestore } from "../../../firebase/adminApp";

import { getConfigObject } from "../../../configs/getConfigObject";
import { ReceivedNotificationDocData } from "../../../types/Notifications";

const configObject = getConfigObject();

if (!configObject) {
  throw new Error("Config object is undefined");
}

function handleAuthorization(key: string | undefined) {
  if (key === undefined) {
    console.error("Unauthorized attemp to sendNotification API.");
    return false;
  }

  if (!configObject) {
    console.error("Config object is undefined");
    return false;
  }

  const notificationAPIKey = configObject.NOTIFICATION_API_KEY;

  if (!notificationAPIKey) {
    console.error("Notification API key not found from .env file.");
    return false;
  }

  return key === notificationAPIKey;
}

async function deleteNotificationObject(
  notificationData: ReceivedNotificationDocData
) {
  try {
    const query = await firestore
      .collection(
        `users/${notificationData.target}/notifications/notifications/receivedNotifications`
      )
      .where("timestamp", "==", notificationData.timestamp)
      .where("type", "==", notificationData.type)
      .where("source", "==", notificationData.source)
      .get();

    const deletedDoc = query.docs[0];

    if (!deletedDoc) {
      console.error("Notification object not found to delete");
      return false;
    }

    await deletedDoc.ref.delete();

    return true;
  } catch (error) {
    console.error("Error on deleting notification doc.: ", error);
    return false;
  }
}

export const deleteNotification = onRequest(async (req, res) => {
  const { authorization } = req.headers;
  const { notificationData } = req.body;

  const isAuthorized = handleAuthorization(authorization);
  if (!isAuthorized) {
    res.status(401).send("Unauthorized");
    return;
  }

  const deleteNotificationObjectResult = await deleteNotificationObject(
    notificationData
  );
  if (!deleteNotificationObjectResult) {
    res.status(500).send("Internal Server Error");
    return;
  }

  res.status(200).send("OK");
  return;
});
