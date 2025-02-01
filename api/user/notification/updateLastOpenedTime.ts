import {onRequest} from "firebase-functions/https";

import {firestore} from "../../../firebase/adminApp";
import getDisplayName from "../../../helpers/getDisplayName";

import {appCheckMiddleware} from "../../../middleware/appCheckMiddleware";

async function handleAuthorization(key: string | undefined) {
  if (key === undefined) {
    console.error("Unauthorized attemp to sendReply API.");
    return false;
  }

  const operationFromUsername = await getDisplayName(key);
  if (!operationFromUsername) return false;

  return operationFromUsername;
}

async function updateLastOpenedTimeMethod(username: string) {
  try {
    const notificationsDoc = firestore.doc(
      `/users/${username}/notifications/notifications`
    );

    await notificationsDoc.update({
      lastOpenedTime: Date.now(),
    });

    return true;
  } catch (error) {
    console.error("Error updating lastOpenedTime: ", error);
    return false;
  }
}

export const updateLastOpenedTime = onRequest(
  appCheckMiddleware(async (req, res) => {
    const {authorization} = req.headers;

    const username = await handleAuthorization(authorization);
    if (!username) {
      res.status(401).send("Unauthorized");
      return;
    }

    const updateLastOpenedTimeResult = await updateLastOpenedTimeMethod(
      username
    );
    if (!updateLastOpenedTimeResult) {
      res.status(500).send("Internal Server Error");
      return;
    }

    res.status(200).send("OK");

    return;
  })
);
