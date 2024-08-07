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
  if (notificationToken === undefined || notificationToken === null) {
    return false;
  }

  const typeOfToken = typeof notificationToken;
  if (typeOfToken !== "string") return false;

  return true;
}

async function updateNotificationSettingsDoc(
  username: string,
  notificationToken: string
) {
  try {
    const notificationSettingsDocRef = firestore.doc(
      `/users/${username}/notifications/notificationSettings`
    );

    await notificationSettingsDocRef.update({
      notificationToken: notificationToken,
    });

    return true;
  } catch (error) {
    console.error(
      "Error while updating notificationSettingsDoc token for user: ",
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

    const updateNotificationSettingsDocResult =
      await updateNotificationSettingsDoc(username, notificationToken);

    if (!updateNotificationSettingsDocResult) {
      res.status(422).send("Invalid Request");
      return;
    }

    res.status(200).send("OK");

    return;
  })
);
