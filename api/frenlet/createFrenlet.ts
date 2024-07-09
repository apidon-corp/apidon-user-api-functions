import { onRequest } from "firebase-functions/v2/https";

import getDisplayName from "../../helpers/getDisplayName";
import { firestore } from "../../firebase/adminApp";
import { FieldValue as fieldValue } from "firebase-admin/firestore";
import { FrenletServerData } from "../../types/Frenlet";

import { NotificationData } from "../../types/Notifications";

import { internalAPIRoutes, keys } from "../../config";

async function handleAuthorization(key: string | undefined) {
  if (key === undefined) {
    console.error("Unauthorized attemp to integrateModel API.");
    return false;
  }

  const operationFromUsername = await getDisplayName(key);
  if (!operationFromUsername) return false;

  return operationFromUsername;
}

function checkProps(fren: string, message: string, tag: string) {
  if (!fren || !message || !tag) {
    console.error("Fren or message is undefined.");
    return false;
  }
  return true;
}

async function checkFrenStatus(fren: string, username: string) {
  try {
    const frenSnapshotAsFollower = await firestore
      .doc(`/users/${username}/followers/${fren}`)
      .get();
    if (!frenSnapshotAsFollower.exists) {
      console.error("Fren is not following requester.");
      return false;
    }

    const frenSnapshotAsFollowing = await firestore
      .doc(`/users/${username}/followings/${fren}`)
      .get();
    if (!frenSnapshotAsFollowing.exists) {
      console.error("Requester is not following fren.");
      return false;
    }

    return true;
  } catch (error) {
    console.error("Error while checking fren status: \n", error);
    return false;
  }
}

async function createFrenletForSender(frenletDocData: FrenletServerData) {
  try {
    await firestore
      .doc(
        `/users/${frenletDocData.frenletSender}/frenlets/frenlets/outgoing/${frenletDocData.frenletDocId}`
      )
      .set({ ...frenletDocData });

    return true;
  } catch (error) {
    console.error("Error while creating frenlet for sender: \n", error);
    return false;
  }
}

async function createFrenletForReceiver(frenletDocData: FrenletServerData) {
  try {
    await firestore
      .doc(
        `/users/${frenletDocData.frenletReceiver}/frenlets/frenlets/incoming/${frenletDocData.frenletDocId}`
      )
      .set({ ...frenletDocData });

    return true;
  } catch (error) {
    console.error("Error while creating frenlet for receiver: \n", error);
    return false;
  }
}

async function createFrenletMethod(frenletDocData: FrenletServerData) {
  const createFrenletForSenderResult = await createFrenletForSender(
    frenletDocData
  );
  if (!createFrenletForSenderResult) return false;

  const frenletCreateForReceiverResult = await createFrenletForReceiver(
    frenletDocData
  );
  if (!frenletCreateForReceiverResult) return false;

  const path = `/users/${frenletDocData}/frenlets/frenlets/incoming/${frenletDocData.frenletDocId}`;

  return {
    path,
    frenletDocData,
  };
}

function createFrenletObject(
  username: string,
  fren: string,
  message: string,
  tag: string,
  ts: number
) {
  const frenletDocData: FrenletServerData = {
    commentCount: 0,
    comments: [],
    frenletDocId: ts.toString(),
    frenletSender: username,
    frenletReceiver: fren,
    likeCount: 0,
    likes: [],
    message: message,
    replies: [],
    tag: tag,
    ts: ts,
  };
  return frenletDocData;
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

async function sendNotification(frenletData: FrenletServerData) {
  const notificationData = createNotificationObject(
    `/users/${frenletData.frenletReceiver}/frenlets/frenlets/incoming/${frenletData.frenletDocId}`,
    frenletData.message,
    frenletData.frenletSender,
    frenletData.frenletReceiver,
    frenletData.ts
  );

  const notificationAPIKey = keys.NOTIFICATION_API_KEY;

  if (!notificationAPIKey) {
    console.error(
      "Notification API key or user panel base URL is undefined fron config-keys file."
    );
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
          notificationData: notificationData,
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

async function deleteNotification(frenletData: FrenletServerData) {
  const notificationData = createNotificationObject(
    `/users/${frenletData.frenletReceiver}/frenlets/frenlets/incoming/${frenletData.frenletDocId}`,
    frenletData.message,
    frenletData.frenletSender,
    frenletData.frenletReceiver,
    frenletData.ts
  );

  const notificationAPIKey = process.env.NOTIFICATION_API_KEY;
  const userPanelBaseURL = process.env.NEXT_PUBLIC_USER_PANEL_BASE_URL;

  if (!notificationAPIKey || !userPanelBaseURL) {
    console.error(
      "Notification API key or user panel base URL is undefined fron .env file."
    );
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

async function updateFrenScore(fren: string) {
  try {
    await firestore.doc(`/users/${fren}`).update({
      frenScore: fieldValue.increment(1),
    });

    return true;
  } catch (error) {
    console.error("Error while increasing fren score: \n", error);
    return false;
  }
}

async function rollback(
  frenletObject: FrenletServerData,
  createFrenletResult: false | FrenletServerData,
  sendNotificationResult: boolean,
  updateFrenScoreResult: boolean,
  fren: string
) {
  try {
    if (createFrenletResult) {
      await firestore
        .doc(
          `/users/${createFrenletResult.frenletSender}/frenlets/frenlets/outgoing/${createFrenletResult.frenletDocId}`
        )
        .delete();
      await firestore
        .doc(
          `/users/${createFrenletResult.frenletReceiver}/frenlets/frenlets/incoming/${createFrenletResult.frenletDocId}`
        )
        .delete();
    }
    if (sendNotificationResult) {
      // Delete Notification
      await deleteNotification(frenletObject);
    }
    if (updateFrenScoreResult) {
      await firestore.doc(`/users/${fren}`).update({
        frenScore: fieldValue.increment(-1),
      });
    }
    return true;
  } catch (error) {
    console.error("Error while rolling back: \n", error);
    return false;
  }
}

export const createFrenlet = onRequest(async (req, res) => {
  const { authorization } = req.headers;
  const { fren, message, tag } = req.body;

  const username = await handleAuthorization(authorization);
  if (!username) {
    res.status(401).send("Unauthorized");
    return;
  }

  const checkPropsResult = checkProps(fren, message, tag);
  if (!checkPropsResult) {
    res.status(500).send("Internal Server Error");
    return;
  }

  const frenStatus = await checkFrenStatus(fren, username);
  if (!frenStatus) {
    res.status(400).send("Bad Request");
    return;
  }

  const ts = Date.now();

  const frenletObject = createFrenletObject(username, fren, message, tag, ts);

  const [createFrenletResult, sendNotificationResult, updateFrenScoreResult] =
    await Promise.all([
      createFrenletMethod(frenletObject),
      sendNotification(frenletObject),
      updateFrenScore(fren),
    ]);

  if (
    !createFrenletResult ||
    !sendNotificationResult ||
    !updateFrenScoreResult
  ) {
    await rollback(
      frenletObject,
      createFrenletResult ? createFrenletResult.frenletDocData : false,
      sendNotificationResult,
      updateFrenScoreResult,
      fren
    );
    {
      res.status(500).send("Internal Server Error");
      return;
    }
  }

  res.status(200).json({
    frenletDocPath: createFrenletResult.path,
  });

  return;
});
