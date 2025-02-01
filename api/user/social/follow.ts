import {onRequest} from "firebase-functions/https";
import {FieldValue} from "firebase-admin/firestore";
import {getRoutes} from "../../../helpers/internalApiRoutes";
import {firestore} from "../../../firebase/adminApp";
import getDisplayName from "../../../helpers/getDisplayName";
import {ReceivedNotificationDocData} from "../../../types/Notifications";
import * as AsyncLock from "async-lock";
import {appCheckMiddleware} from "../../../middleware/appCheckMiddleware";
import {defineSecret} from "firebase-functions/params";
const notificationAPIKeySecret = defineSecret("NOTIFICATION_API_KEY");

async function handleAuthorization(key: string | undefined) {
  if (key === undefined) {
    console.error("Unauthorized attemp to sendReply API.");
    return false;
  }

  const operationFromUsername = await getDisplayName(key);
  if (!operationFromUsername) return false;

  return operationFromUsername;
}

function checkProps(operationTo: string, opCode: number) {
  if (!operationTo || !opCode) {
    console.error("Both operationTo and opCode is undefined.");
    return false;
  }

  if (!(opCode == -1 || opCode === 1)) {
    console.error("Invalid action");
    return false;
  }

  return true;
}

function checkSelfFollowing(operationTo: string, operationFrom: string) {
  return operationTo == operationFrom;
}

async function checkFollowStatus(username: string, operationTo: string) {
  try {
    const followingsSnapshot = await firestore
      .collection(`/users/${username}/followings`)
      .get();

    const followingsUsernames = followingsSnapshot.docs.map((doc) => doc.id);

    // Especailly to use delete notification. (We need follow timestamp).
    const followDocData = followingsSnapshot.docs
      .find((d) => d.id === operationTo)
      ?.data();

    return {
      followStatus: followingsUsernames.includes(operationTo),
      followDocData: followDocData,
    };
  } catch (error) {
    console.error("Error while checking follow status", error);
    return false;
  }
}

function checkRequestValid(action: number, isFollowing: boolean) {
  if (action === -1 && !isFollowing) return false;
  if (action === 1 && isFollowing) return false;
  return true;
}

async function updateRequesterFollowings(
  username: string,
  operationTo: string,
  action: number,
  ts: number
) {
  try {
    if (action === -1) {
      await firestore
        .doc(`/users/${username}/followings/${operationTo}`)
        .delete();
    }
    if (action === 1) {
      await firestore.doc(`/users/${username}/followings/${operationTo}`).set({
        followTime: ts,
      });
    }

    return true;
  } catch (error) {
    console.error("Error while updating requester followings", error);
    return false;
  }
}

async function updateOperationToFollowers(
  operationTo: string,
  operationFrom: string,
  action: number,
  ts: number
) {
  try {
    if (action === -1) {
      await firestore
        .doc(`/users/${operationTo}/followers/${operationFrom}`)
        .delete();
    }
    if (action === 1) {
      await firestore
        .doc(`/users/${operationTo}/followers/${operationFrom}`)
        .set({
          followTime: ts,
        });
    }

    return true;
  } catch (error) {
    console.error("Error while updating operationTo followers", error);
    return false;
  }
}

async function updateRequesterFollowingCount(username: string, action: number) {
  try {
    const requesterDocRef = firestore.doc(`/users/${username}`);
    await requesterDocRef.update({
      followingCount: FieldValue.increment(action),
    });
    return true;
  } catch (error) {
    console.error("Error while updating requester following count", error);
    return false;
  }
}

async function updateOperationToFollowerCount(
  operationTo: string,
  action: number
) {
  try {
    const operationToDocRef = firestore.doc(`/users/${operationTo}`);
    await operationToDocRef.update({
      followerCount: FieldValue.increment(action),
    });
    return true;
  } catch (error) {
    console.error("Error while updating operationTo followers count", error);
    return false;
  }
}

function createNotificationData(
  followTo: string,
  username: string,
  timestamp: number
) {
  const notificationData: ReceivedNotificationDocData = {
    type: "follow",
    params: {
      followOperationTo: followTo,
    },
    source: username,
    target: followTo,
    timestamp: timestamp,
  };

  return notificationData;
}

async function handleNotification(
  operationFrom: string,
  operationTo: string,
  action: number,
  ts: number,
  followDocData: undefined | FirebaseFirestore.DocumentData,
  notificationAPIKey: string
) {
  if (action === 1) {
    const notificationSent = await sendNotification(
      operationTo,
      operationFrom,
      ts,
      notificationAPIKey
    );
    if (!notificationSent) {
      console.error("Failed to send notification.");
      return false;
    }
    return true;
  }
  if (action === -1) {
    const notificationDeleted = await deleteNotification(
      operationTo,
      operationFrom,
      followDocData?.followTime || 0,
      notificationAPIKey
    );
    if (!notificationDeleted) {
      console.error("Failed to delete notification.");
      return false;
    }
    return true;
  }
  return false;
}

async function sendNotification(
  operationTo: string,
  operationFrom: string,
  timestamp: number,
  notificationAPIKey: string
) {
  const notificationObject = createNotificationData(
    operationTo,
    operationFrom,
    timestamp
  );

  try {
    const response = await fetch(getRoutes().notification.sendNotification, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "authorization": notificationAPIKey,
      },
      body: JSON.stringify({
        notificationData: notificationObject,
      }),
    });

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
  operationTo: string,
  operationFrom: string,
  timestamp: number,
  notificationAPIKey: string
) {
  const notificationObject = createNotificationData(
    operationTo,
    operationFrom,
    timestamp
  );

  try {
    const response = await fetch(getRoutes().notification.deleteNotification, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "authorization": notificationAPIKey,
      },
      body: JSON.stringify({
        notificationData: notificationObject,
      }),
    });

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

const lock = new AsyncLock();

const delay = async (ms: number) => {
  return new Promise((resolve) => setTimeout(resolve, ms));
};

export const follow = onRequest(
  {secrets: [notificationAPIKeySecret]},
  appCheckMiddleware(async (req, res) => {
    const {authorization} = req.headers;
    const {operationTo: operationToUsername, opCode} = req.body;

    const username = await handleAuthorization(authorization);
    if (!username) {
      res.status(401).send("Unauthorized");
      return;
    }

    const checkPropsResult = checkProps(operationToUsername, opCode);
    if (!checkPropsResult) {
      res.status(422).send("Invalid Request");
      return;
    }

    if (checkSelfFollowing(operationToUsername, username)) {
      res.status(403).send("Forbidden.");
      return;
    }

    try {
      await lock.acquire(username, async () => {
        const followStatus = await checkFollowStatus(
          username,
          operationToUsername
        );
        if (!followStatus) {
          res.status(500).send("Internal Server Error");
          return;
        }

        const checkRequestValidResult = checkRequestValid(
          opCode,
          followStatus.followStatus
        );
        if (!checkRequestValidResult) {
          res.status(400).send("Invalid Request");
          return;
        }

        const ts = Date.now();

        updateOperationToFollowerCount(operationToUsername, opCode);
        updateOperationToFollowers(operationToUsername, username, opCode, ts);

        updateRequesterFollowingCount(username, opCode);
        updateRequesterFollowings(username, operationToUsername, opCode, ts);

        handleNotification(
          username,
          operationToUsername,
          opCode,
          ts,
          followStatus.followDocData,
          notificationAPIKeySecret.value()
        );

        // Ensuring all request has been sent.
        await delay(250);

        res.status(200).send("OK");
        return;
      });
    } catch (error) {
      res.status(500).send("Internal Server Error");
      return console.error(
        "Error on acquiring lock for follow operation: \n",
        error
      );
    }
  })
);
