import {onRequest} from "firebase-functions/v2/https";
import getDisplayName from "../../helpers/getDisplayName";
import {firestore} from "../../firebase/adminApp";
import {FrenletServerData} from "../../types/Frenlet";
import {FieldValue as fieldValue} from "firebase-admin/firestore";
import {NotificationData} from "../../types/Notifications";
import {internalAPIRoutes, keys} from "../../config";

async function handleAuthorization(key: string | undefined) {
  if (key === undefined) {
    console.error("Unauthorized attemp to sendReply API.");
    return false;
  }

  const operationFromUsername = await getDisplayName(key);
  if (!operationFromUsername) return false;

  return operationFromUsername;
}

function checkProps(message: string, frenletDocPath: string) {
  if (!message || !frenletDocPath) return false;
  return true;
}

async function checkCanReply(replySender: string, frenletDocPath: string) {
  try {
    const frenletDocSnapshot = await firestore.doc(frenletDocPath).get();
    if (!frenletDocSnapshot.exists) {
      console.error("Frenlet doc not found.");
      return false;
    }

    const frenletDocData = frenletDocSnapshot.data() as FrenletServerData;

    if (frenletDocData === undefined) {
      console.error("Frenlet doc data is undefined.");
      return false;
    }

    if (
      [frenletDocData.frenletSender, frenletDocData.frenletReceiver].includes(
        replySender
      )
    ) {
      return {
        sender: frenletDocData.frenletSender,
        receiver: frenletDocData.frenletReceiver,
        frenletId: frenletDocData.frenletDocId,
      };
    }

    const followersCollectionSnapshot = await firestore
      .collection(`/users/${replySender}/followers`)
      .get();
    const followers = followersCollectionSnapshot.docs.map((doc) => doc.id);

    const followingsCollectionSnapshot = await firestore
      .collection(`/users/${replySender}/followings`)
      .get();
    const followings = followingsCollectionSnapshot.docs.map((doc) => doc.id);

    const mainCharactersFollowsThisGuy =
      followers.includes(frenletDocData.frenletSender) &&
      followers.includes(frenletDocData.frenletReceiver);

    const replySenderFollowsTheseGuys =
      followings.includes(frenletDocData.frenletSender) &&
      followings.includes(frenletDocData.frenletReceiver);

    if (mainCharactersFollowsThisGuy && replySenderFollowsTheseGuys) {
      return {
        sender: frenletDocData.frenletSender,
        receiver: frenletDocData.frenletReceiver,
        frenletId: frenletDocData.frenletDocId,
      };
    }

    return false;
  } catch (error) {
    console.error("Error on checking canReply: \n", error);
    return false;
  }
}

async function createReplyForSender(
  replySender: string,
  frenletDocPath: string,
  message: string,
  ts: number
) {
  try {
    await firestore.doc(frenletDocPath).update({
      replies: fieldValue.arrayUnion({
        message: message,
        sender: replySender,
        ts: ts,
      }),
    });
    return true;
  } catch (error) {
    console.error("Error on creating reply for sender: \n", error);
    return false;
  }
}

async function createReplyForReceiver(
  replySender: string,
  frenletDocPath: string,
  message: string,
  ts: number
) {
  try {
    await firestore.doc(frenletDocPath).update({
      replies: fieldValue.arrayUnion({
        message: message,
        sender: replySender,
        ts: ts,
      }),
    });
    return true;
  } catch (error) {
    console.error("Error on creating reply for receiver: \n", error);
    return false;
  }
}

async function createReply(
  frenletReceiver: string,
  frenletSender: string,
  frenletId: string,
  replySender: string,
  message: string,
  ts: number
) {
  const [senderResult, receiverResult] = await Promise.all([
    createReplyForSender(
      replySender,
      `/users/${frenletSender}/frenlets/frenlets/outgoing/${frenletId}`,
      message,
      ts
    ),
    createReplyForReceiver(
      replySender,
      `/users/${frenletReceiver}/frenlets/frenlets/incoming/${frenletId}`,
      message,
      ts
    ),
  ]);

  if (!senderResult || !receiverResult) return false;
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

async function sendNotificationToOneTarget(
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

async function handleNotification(
  replySender: string,
  frenletReceiver: string,
  frenletSender: string,
  frenletId: string,
  message: string,
  timestamp: number
) {
  const frenletDocPath = `/users/${frenletReceiver}/frenlets/frenlets/incoming/${frenletId}`;

  const [receiverSendResult, senderSendResult] = await Promise.all([
    sendNotificationToOneTarget(
      replySender,
      frenletDocPath,
      frenletReceiver,
      message,
      timestamp
    ),
    sendNotificationToOneTarget(
      replySender,
      frenletDocPath,
      frenletSender,
      message,
      timestamp
    ),
  ]);

  return receiverSendResult && senderSendResult;
}

export const sendReply = onRequest(async (req, res) => {
  const {authorization} = req.headers;
  const {message, frenletDocPath} = req.body;

  const replySender = await handleAuthorization(authorization);
  if (!replySender) {
    res.status(401).send("Unauthorized");
    return;
  }

  const checkPropsResult = checkProps(replySender, frenletDocPath);
  if (!checkPropsResult) {
    res.status(422).send("Invalid Request");
    return;
  }

  const canReply = await checkCanReply(replySender, frenletDocPath);
  if (!canReply) {
    res.status(401).send("Unauthorized");
    return;
  }

  const ts = Date.now();

  const result = await createReply(
    canReply.receiver,
    canReply.sender,
    canReply.frenletId,
    replySender,
    message,
    ts
  );
  if (!result) {
    res.status(500).send("Internal Server Error");
    return;
  }

  const notificationResult = await handleNotification(
    replySender,
    canReply.receiver,
    canReply.sender,
    canReply.frenletId,
    message,
    ts
  );

  if (!notificationResult) {
    res.status(500).send("Internal Server Error");
    return;
  }

  res.status(200).send("OK");

  return;
});
