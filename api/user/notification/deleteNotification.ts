import {onRequest} from "firebase-functions/https";

import {firestore} from "../../../firebase/adminApp";
import {ReceivedNotificationDocData} from "../../../types/Notifications";

import {defineSecret} from "firebase-functions/params";
const notificationAPIKeySecret = defineSecret("NOTIFICATION_API_KEY");

function handleAuthorization(
  key: string | undefined,
  notificationAPIKey: string
) {
  if (key === undefined) {
    console.error("Unauthorized attemp to sendNotification API.");
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

export const deleteNotification = onRequest(
  {secrets: [notificationAPIKeySecret]},
  async (req, res) => {
    const {authorization} = req.headers;
    const {notificationData} = req.body;

    const isAuthorized = handleAuthorization(
      authorization,
      notificationAPIKeySecret.value()
    );
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
  }
);
