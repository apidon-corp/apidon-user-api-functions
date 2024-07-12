import { onRequest } from "firebase-functions/v2/https";

import getDisplayName from "../../helpers/getDisplayName";
import { FrenletServerData, RepletServerData } from "../../types/Frenlet";
import { firestore } from "../../firebase/adminApp";

import { FieldValue as fieldValue } from "firebase-admin/firestore";
import { NotificationData } from "../../types/Notifications";

import { internalAPIRoutes, keys } from "../../config";

import { appCheckMiddleware } from "../../middleware/appCheckMiddleware";

async function handleAuthorization(key: string | undefined) {
  if (key === undefined) {
    console.error("Unauthorized attemp to integrateModel API.");
    return false;
  }

  const operationFromUsername = await getDisplayName(key);
  if (!operationFromUsername) return false;

  return operationFromUsername;
}

function checkProps(frenletDocPath: string, replet: RepletServerData) {
  if (!frenletDocPath || !replet) {
    console.error("frenletDocPath or replet is undefined.");
    return false;
  }
  return true;
}

async function checkCanDeleteReplet(
  deleteRequester: string,
  frenletDocPath: string,
  replet: RepletServerData
) {
  try {
    const frenletDocSnapshot = await firestore.doc(frenletDocPath).get();
    if (!frenletDocSnapshot.exists) {
      console.error("Frenlet doc does not exist.");
      return false;
    }

    const frenletDocData = frenletDocSnapshot.data() as FrenletServerData;
    if (frenletDocData === undefined) {
      console.error("Frenlet doc data is undefined.");
      return false;
    }

    const repletToBeDeleted = frenletDocData.replies.find(
      (r) =>
        r.message === replet.message &&
        r.sender === replet.sender &&
        r.ts == replet.ts
    );

    if (!repletToBeDeleted) {
      console.error("Replet to be deleted not found.");
      return false;
    }

    const usersCanDeleteThisReplet = [
      frenletDocData.frenletSender,
      frenletDocData.frenletReceiver,
      repletToBeDeleted.sender,
    ];

    if (!usersCanDeleteThisReplet.includes(deleteRequester)) return false;

    return {
      repletToBeDeleted: repletToBeDeleted,
      frenletDocData: frenletDocData,
    };
  } catch (error) {
    console.error("Error on checking canDeleteReplet: \n", error);
    return false;
  }
}

async function deleteRepletForReceiver(
  frenletDocPathForReceiver: string,
  repletToBeDeleted: RepletServerData
) {
  try {
    await firestore.doc(frenletDocPathForReceiver).update({
      replies: fieldValue.arrayRemove({ ...repletToBeDeleted }),
    });
    return true;
  } catch (error) {
    console.error("Error while deleting replet for receiver: \n", error);
    return false;
  }
}

async function deleteRepletForSender(
  frenletDocPathForSender: string,
  repletToBeDeleted: RepletServerData
) {
  try {
    await firestore.doc(frenletDocPathForSender).update({
      replies: fieldValue.arrayRemove({ ...repletToBeDeleted }),
    });
    return true;
  } catch (error) {
    console.error("Error while deleting replet for sender: \n", error);
    return false;
  }
}

async function deleteRepletMethod(
  frenletDocData: FrenletServerData,
  replet: RepletServerData
) {
  const deleteRepletForReceiverResult = await deleteRepletForReceiver(
    `/users/${frenletDocData.frenletReceiver}/frenlets/frenlets/incoming/${frenletDocData.frenletDocId}`,
    replet
  );
  if (!deleteRepletForReceiverResult) return false;

  const deleteRepletForSenderResult = await deleteRepletForSender(
    `/users/${frenletDocData.frenletSender}/frenlets/frenlets/outgoing/${frenletDocData.frenletDocId}`,
    replet
  );
  if (!deleteRepletForSenderResult) return false;

  return true;
}

function createNotificationObject(
  frenletDocPath: string,
  message: string,
  replySender: string,
  target: string,
  timestamp: number
) {
  const notificationObject: NotificationData = {
    type: "frenletReply",
    params: {
      message: message,
      repliedFrenletDocPath: frenletDocPath,
    },
    source: replySender,
    target: target,
    timestamp: timestamp,
  };

  return notificationObject;
}

async function deleteNotificationFromOneTarget(
  replySender: string,
  frenletDocPath: string,
  target: string,
  message: string,
  timestamp: number
) {
  if (replySender === target) return true;

  const notificationObject = createNotificationObject(
    frenletDocPath,
    message,
    replySender,
    target,
    timestamp
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

async function deleteNotification(
  replySender: string,
  frenletReceiver: string,
  frenletSender: string,
  frenletId: string,
  message: string,
  timestamp: number
) {
  const frenletDocPath = `/users/${frenletReceiver}/frenlets/frenlets/incoming/${frenletId}`;

  const [receiverSendResult, senderSendResult] = await Promise.all([
    deleteNotificationFromOneTarget(
      replySender,
      frenletDocPath,
      frenletReceiver,
      message,
      timestamp
    ),
    deleteNotificationFromOneTarget(
      replySender,
      frenletDocPath,
      frenletSender,
      message,
      timestamp
    ),
  ]);

  return receiverSendResult && senderSendResult;
}

export const deleteReplet = onRequest(
  appCheckMiddleware(async (req, res) => {
    const { authorization } = req.headers;
    const { frenletDocPath, replet } = req.body;

    const username = await handleAuthorization(authorization);
    if (!username) {
      res.status(401).send("Unauthorized");
      return;
    }

    const checkPropsResult = checkProps(frenletDocPath, replet);
    if (!checkPropsResult) {
      res.status(422).send("Invalid Request");
      return;
    }

    const checkCanDeleteRepletResult = await checkCanDeleteReplet(
      username,
      frenletDocPath,
      replet
    );
    if (!checkCanDeleteRepletResult) {
      res.status(403).send("Forbidden");
      return;
    }

    const deleteRepletResult = await deleteRepletMethod(
      checkCanDeleteRepletResult.frenletDocData,
      checkCanDeleteRepletResult.repletToBeDeleted
    );
    if (!deleteRepletResult) {
      res.status(500).send("Internal Server Error");
      return;
    }

    const deleteNotificationResult = await deleteNotification(
      username,
      checkCanDeleteRepletResult.frenletDocData.frenletReceiver,
      checkCanDeleteRepletResult.frenletDocData.frenletSender,
      checkCanDeleteRepletResult.frenletDocData.frenletDocId,
      replet.message,
      replet.ts
    );
    if (!deleteNotificationResult) {
      res.status(500).send("Internal Server Error");
      return;
    }

    res.status(200).send("OK");
    return;
  })
);
