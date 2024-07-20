import {onRequest} from "firebase-functions/v2/https";

import {keys} from "../../../config";
import {firestore} from "../../../firebase/adminApp";
import {FieldValue as fieldValue} from "firebase-admin/firestore";

import {NotificationData} from "../../../types/Notifications";

function handleAuthorization(key: string | undefined) {
  if (key === undefined) {
    console.error("Unauthorized attemp to sendNotification API.");
    return false;
  }

  const notificationAPIKey = keys.NOTIFICATION_API_KEY;

  if (!notificationAPIKey) {
    console.error("Notification API key not found from .env file.");
    return false;
  }

  return key === notificationAPIKey;
}

async function deleteNotificationObject(notificationData: NotificationData) {
  try {
    const notificationDocRef = firestore.doc(
      `/users/${notificationData.target}/notifications/notifications`
    );

    await notificationDocRef.update({
      notifications: fieldValue.arrayRemove(notificationData),
    });

    return true;
  } catch (error) {
    console.error(
      "Error on deleting notification object from notifications array: ",
      error
    );
    return false;
  }
}

export const deleteNotification = onRequest(async (req, res) => {
  const {authorization} = req.headers;
  const {notificationData} = req.body;

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
