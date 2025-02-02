import {firestore} from "../../../firebase/adminApp";
import getDisplayName from "../../../helpers/getDisplayName";
import {appCheckMiddleware} from "../../../middleware/appCheckMiddleware";
import {onRequest} from "firebase-functions/https";
import {FieldValue} from "firebase-admin/firestore";
import {FollowerDocData} from "../../../types/User";

import * as AsyncLock from "async-lock";
import {sendNotification} from "../../../helpers/notification/sendNotification";
import {deleteNotification} from "../../../helpers/notification/deleteNotification";

async function handleAuthorization(key: string | undefined) {
  if (key === undefined) {
    console.error("Unauthorized attemp to sendReply API.");
    return false;
  }

  const operationFromUsername = await getDisplayName(key);
  if (!operationFromUsername) return false;

  return operationFromUsername;
}

function checkProps(operationTo: string) {
  if (!operationTo) {
    console.error("operationTo is undefined.");
    return false;
  }
  return true;
}

function isFollowingOwn(requesterUsername: string, operationTo: string) {
  return requesterUsername === operationTo;
}

async function getCurrentFollowStatus(
  requesterUsername: string,
  operationTo: string
): Promise<
  | {
      status: "following";
      ts: number;
    }
  | {
      status: "notFollowing";
    }
  | false
> {
  try {
    const possibleFollowingDoc = await firestore
      .collection("users")
      .doc(requesterUsername)
      .collection("followings")
      .doc(operationTo)
      .get();

    if (possibleFollowingDoc.exists) {
      const ts = (possibleFollowingDoc.data() as FollowerDocData).followTime;

      return {
        status: "following",
        ts,
      };
    } else {
      return {
        status: "notFollowing",
      };
    }
  } catch (error) {
    console.error("Error while checking follow status", error);
    return false;
  }
}

async function updateFollowNumberOfUser(
  username: string,
  field: "followingCount" | "followerCount",
  increment: -1 | 1
) {
  try {
    const userDocRef = firestore.collection("users").doc(username);

    await userDocRef.update({
      [field]: FieldValue.increment(increment),
    });

    return true;
  } catch (error) {
    console.error("Error while updating follow count", error);
    return false;
  }
}

async function handleFollowCounts(
  requesterUsername: string,
  operationTo: string,
  operation: "follow" | "unFollow"
) {
  try {
    const results = await Promise.all([
      updateFollowNumberOfUser(
        requesterUsername,
        "followingCount",
        operation === "follow" ? 1 : -1
      ),
      updateFollowNumberOfUser(
        operationTo,
        "followerCount",
        operation === "follow" ? 1 : -1
      ),
    ]);

    if (results.every((result) => result)) {
      return true;
    } else {
      console.error("Error while updating follow counts. See other logs.");
      return false;
    }
  } catch (error) {
    console.error("Error while updating follow counts: ", error);
    return false;
  }
}

async function updateFollowCollectionOfUser(
  username: string,
  collectionName: "followings" | "followers",
  operation: "add" | "delete",
  target: string,
  ts: number
) {
  try {
    const collectionRef = firestore
      .collection("users")
      .doc(username)
      .collection(collectionName);

    if (operation === "add") {
      const newFollowDocData: FollowerDocData = {followTime: ts};
      await collectionRef.doc(target).set(newFollowDocData);
      return true;
    }

    if (operation === "delete") {
      await collectionRef.doc(target).delete();
      return true;
    }

    console.error("Invalid operation.");
    return false;
  } catch (error) {
    console.error("Error while updating follow collection: ", error);
    return false;
  }
}

async function handleFollowDocs(
  requesterUsername: string,
  operationTo: string,
  operation: "follow" | "unFollow",
  ts: number
) {
  try {
    const results = await Promise.all([
      updateFollowCollectionOfUser(
        requesterUsername,
        "followings",
        operation === "follow" ? "add" : "delete",
        operationTo,
        ts
      ),
      updateFollowCollectionOfUser(
        operationTo,
        "followers",
        operation === "follow" ? "add" : "delete",
        requesterUsername,
        ts
      ),
    ]);

    if (results.every((result) => result)) {
      return true;
    } else {
      console.error("Error while updating follow docs. See other logs.");
      return false;
    }
  } catch (error) {
    console.error("Error while updating follow docs: ", error);
    return false;
  }
}

async function handleNotification(
  requesterUsername: string,
  operationTo: string,
  operation: "follow" | "unFollow",
  ts: number
) {
  if (operation === "follow") {
    const notificationResult = await sendNotification({
      type: "follow",
      timestamp: ts,
      source: requesterUsername,
      target: operationTo,
      params: {
        followOperationTo: operationTo,
      },
    });
    if (!notificationResult) {
      console.error("Error while sending notification. See other logs.");
      return false;
    }
  }

  if (operation === "unFollow") {
    const notificationResult = await deleteNotification({
      type: "follow",
      target: operationTo,
      source: requesterUsername,
      params: {
        followOperationTo: operationTo,
      },
      timestamp: ts,
    });
    if (!notificationResult) {
      console.error("Error while deleting notification. See other logs.");
      return false;
    }
  }

  return true;
}

async function processFollow(requesterUsername: string, operationTo: string) {
  if (!checkProps(operationTo)) {
    throw new Error("Invalid Request");
  }

  if (isFollowingOwn(requesterUsername, operationTo)) {
    throw new Error("Forbidden.");
  }

  const currentFollowStatus = await getCurrentFollowStatus(
    requesterUsername,
    operationTo
  );

  if (!currentFollowStatus) {
    throw new Error("Internal Server Error");
  }

  // To Catch Notifications Especially
  const commonTimestamp = Date.now();

  handleFollowCounts(
    requesterUsername,
    operationTo,
    currentFollowStatus.status === "following" ? "unFollow" : "follow"
  );

  handleFollowDocs(
    requesterUsername,
    operationTo,
    currentFollowStatus.status === "following" ? "unFollow" : "follow",
    commonTimestamp
  );

  handleNotification(
    requesterUsername,
    operationTo,
    currentFollowStatus.status === "following" ? "unFollow" : "follow",
    currentFollowStatus.status === "following" ?
      currentFollowStatus.ts :
      commonTimestamp
  );
}

const lock = new AsyncLock();

export const follow = onRequest(
  appCheckMiddleware(async (req, res) => {
    const {authorization} = req.headers;
    const {operationTo} = req.body;

    const requesterUsername = await handleAuthorization(authorization);
    if (!requesterUsername) {
      res.status(401).send("Unauthorized");
      return;
    }

    const lockId = `${requesterUsername}-${operationTo}`;

    try {
      await lock.acquire(lockId, async () => {
        await processFollow(requesterUsername, operationTo);
        res.status(200).send("OK");
      });
    } catch (error) {
      console.error("Error while processing follow: ", error);
      res.status(400).send(`${error}`);
    }
  })
);
