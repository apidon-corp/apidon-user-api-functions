import {onRequest} from "firebase-functions/v2/https";

import {firestore} from "../../firebase/adminApp";
import getDisplayName from "../../helpers/getDisplayName";

import {FrenletServerData} from "../../types/Frenlet";

import {FieldValue as fieldValue} from "firebase-admin/firestore";

import {NotificationData} from "../../types/Notifications";

import {keys, internalAPIRoutes} from "../../config";

import {appCheckMiddleware} from "../../middleware/appCheckMiddleware";

async function handleAuthorization(key: string | undefined) {
  if (key === undefined) {
    console.error("Unauthorized attemp to integrateModel API.");
    return false;
  }

  const operationFromUsername = await getDisplayName(key);
  if (!operationFromUsername) return false;

  return operationFromUsername;
}

function checkProps(frenletDocPath: string) {
  if (!frenletDocPath) {
    console.error("frenletDocPath is undefined to delete.");
    return false;
  }
  return true;
}

async function checkCanDeleteFrenlet(
  frenletDocPath: string,
  deleteRequester: string
) {
  try {
    const frenletDocSnapshot = await firestore.doc(frenletDocPath).get();
    if (!frenletDocSnapshot.exists) {
      console.error("frenletDoc doesn't exist");
      return false;
    }

    const frenletDocData = frenletDocSnapshot.data() as FrenletServerData;
    if (frenletDocData === undefined) {
      console.error("frenletDocData is undefined");
      return false;
    }

    const usersCanDelete = [
      frenletDocData.frenletSender,
      frenletDocData.frenletReceiver,
    ];
    if (!usersCanDelete.includes(deleteRequester)) {
      console.error("User can't delete frenlet");
      return false;
    }

    return frenletDocData;
  } catch (error) {
    console.error("Error while checking can delete frenlet: \n", error);
    return false;
  }
}

async function deleteFrenletForReceiver(frenletDocPathForReceiver: string) {
  try {
    await firestore.doc(frenletDocPathForReceiver).delete();
    return true;
  } catch (error) {
    console.error("Error while deleting frenletDoc for receiver: \n", error);
    return false;
  }
}

async function deleteFrenletForSender(frenletDocPathForSender: string) {
  try {
    await firestore.doc(frenletDocPathForSender).delete();
    return true;
  } catch (error) {
    console.error("Error while deleting frenletDoc for sender: \n", error);
    return false;
  }
}

async function decreaseFrenScore(frenletReceiver: string) {
  try {
    const userDocRef = firestore.doc(`/users/${frenletReceiver}`);

    await userDocRef.update({
      frenScore: fieldValue.increment(-1),
    });

    return true;
  } catch (error) {
    console.error("Error while decreasing fren score: \n", error);
    return false;
  }
}

function createNotificationObject(
  frenletDocPath: string,
  message: string,
  sender: string,
  receiver: string,
  timestamp: number
) {
  const notificationData: NotificationData = {
    type: "frenletCreate",
    params: {
      createdFrenletDocPath: frenletDocPath,
      message: message,
    },
    source: sender,
    target: receiver,
    timestamp: timestamp,
  };

  return notificationData;
}

async function deleteNotification(frenletData: FrenletServerData) {
  const notificationData = createNotificationObject(
    `/users/${frenletData.frenletReceiver}/frenlets/frenlets/incoming/${frenletData.frenletDocId}`,
    frenletData.message,
    frenletData.frenletSender,
    frenletData.frenletReceiver,
    frenletData.ts
  );

  const notificationAPIKey = keys.NOTIFICATION_API_KEY;

  if (!notificationAPIKey) {
    console.error("Notification API key is undefined fron .env file.");
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
          notificationData: notificationData,
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
    console.error("Error deleting notification: ", error);
    return false;
  }
}

async function deleteFrenletMethod(frenletDocData: FrenletServerData) {
  const [
    deleteFrenletForReceiverResult,
    deleteFrenletForSenderResult,
    deleteNotificationResult,
    decreaseFrenScoreResult,
  ] = await Promise.all([
    deleteFrenletForReceiver(
      `/users/${frenletDocData.frenletReceiver}/frenlets/frenlets/incoming/${frenletDocData.frenletDocId}`
    ),
    deleteFrenletForSender(
      `/users/${frenletDocData.frenletSender}/frenlets/frenlets/outgoing/${frenletDocData.frenletDocId}`
    ),
    deleteNotification(frenletDocData),
    decreaseFrenScore(frenletDocData.frenletReceiver),
  ]);

  if (
    !deleteFrenletForReceiverResult ||
    !deleteFrenletForSenderResult ||
    !deleteNotificationResult ||
    !decreaseFrenScoreResult
  ) {
    return false;
  }

  return true;
}

export const deleteFrenlet = onRequest(
  appCheckMiddleware(async (req, res) => {
    const {authorization} = req.headers;
    const {frenletDocPath} = req.body;

    const username = await handleAuthorization(authorization);
    if (!username) {
      res.status(401).send("UnAuthorized");
      return;
    }

    const checkPropsResult = checkProps(frenletDocPath);
    if (!checkPropsResult) {
      res.status(422).send("Invalid prop");
      return;
    }

    const checkCanDeleteFrenletResult = await checkCanDeleteFrenlet(
      frenletDocPath,
      username
    );
    if (!checkCanDeleteFrenletResult) {
      res.status(401).send("UnAuthorized");
      return;
    }

    const deleteFrenletResult = await deleteFrenletMethod(
      checkCanDeleteFrenletResult
    );
    if (!deleteFrenletResult) {
      res.status(500).send("Internal Server Error");
      return;
    }

    res.status(200).send("OK");
    return;
  })
);
