import {onRequest} from "firebase-functions/v2/https";

import getDisplayName from "../../../helpers/getDisplayName";
import {firestore} from "../../../firebase/adminApp";

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

function checkProps(notificationToken: string) {
  if (!notificationToken) return false;
  return true;
}

async function updateNotificationDoc(
  username: string,
  notificationToken: string
) {
  try {
    const notificationDocRef = firestore.doc(
      `/users/${username}/notifications/notifications`
    );

    await notificationDocRef.update({
      notificationToken: notificationToken,
    });

    return true;
  } catch (error) {
    console.error(
      "Error while updating notification token for user: ",
      username,
      "\nError: ",
      error
    );
    return false;
  }
}

export const updateNotificationToken = onRequest(
  appCheckMiddleware(async (req, res) => {
    const {authorization} = req.headers;
    const {notificationToken} = req.body;

    const username = await handleAuthorization(authorization);
    if (!username) {
      res.status(401).send("Unauthorized");
      return;
    }

    const checkPropsResult = checkProps(notificationToken);
    if (!checkPropsResult) {
      res.status(422).send("Invalid Request");
      return;
    }

    const updateNotificationDocResult = await updateNotificationDoc(
      username,
      notificationToken
    );

    if (!updateNotificationDocResult) {
      res.status(422).send("Invalid Request");
      return;
    }

    res.status(200).send("OK");

    return;
  })
);
