import {onRequest} from "firebase-functions/https";

import {firestore} from "../../../firebase/adminApp";
import {
  ExpoPushMessage,
  NotificationSettingsData,
} from "@/types/Notifications";
import {handleAdminAuthorization} from "../../../helpers/handleAdminAuthorization";


/**
 * Checks the presence of required properties.
 * @param title The title of the notification.
 * @param description - The description of the notification.
 * @returns True if both title and description are present, otherwise false.
 */
function checkProps(title: string, description: string, username: string) {
  if (!title || !description || !username) {
    console.error("Title, description or username is missing");
    return false;
  }

  return true;
}

async function getFollowersOfUsers(username: string) {
  try {
    const followerCollectionRef = firestore.collection(
      `users/${username}/followers`
    );

    const collectionSnapshot = await followerCollectionRef.get();

    return collectionSnapshot.docs.map((d) => d.id);
  } catch (error) {
    console.error("Error on getting followers of user: ", error);
    return false;
  }
}

/**
 * Fetches the notification token for a specific user.
 * @param username - The username of the user.
 * @returns The notification token or false if an error occurs.
 */
async function getNotificationToken(username: string) {
  try {
    const notificationDocRef = firestore.doc(
      `users/${username}/notifications/notificationSettings`
    );
    const notificationSettingsDocSnapshot = await notificationDocRef.get();

    if (!notificationSettingsDocSnapshot.exists) {
      console.error(
        "Notification Settings doc doesn't exist for user: ",
        username
      );
      return false;
    }

    const notificationSettingsDocData =
      notificationSettingsDocSnapshot.data() as NotificationSettingsData;
    if (!notificationSettingsDocData) {
      console.error(
        "Notification Settings doc data doesn't exist for user: ",
        username
      );
      return false;
    }

    const notificationToken = notificationSettingsDocData.notificationToken;
    if (!notificationToken) {
      console.error("Notification token doesn't exist for user: ", username);
      return false;
    }

    return notificationToken;
  } catch (error) {
    console.error(
      "Error while getting notification token for user: ",
      username,
      "\nError: ",
      error
    );
    return false;
  }
}

/**
 * Fetches the notification tokens for all users.
 * @param usernames - The list of usernames.
 * @returns A list of notification tokens or false if an error occurs.
 */
async function getNotificationTokensOfAllUsers(usernames: string[]) {
  try {
    const getNotificationTokenResults = await Promise.all(
      usernames.map((username) => getNotificationToken(username))
    );
    const notificationTokens: string[] = [];

    for (const result of getNotificationTokenResults) {
      if (result) notificationTokens.push(result);
    }

    return notificationTokens;
  } catch (error) {
    console.error(
      "Error while getting notification tokens of all users: ",
      error
    );
    return false;
  }
}

/**
 * Creates an Expo push message.
 * @param title - The title of the notification.
 * @param description - The description of the notification.
 * @param notificationToken - The notification token of the user.
 * @returns The Expo push message object.
 */
function createExpoPushMessage(
  title: string,
  description: string,
  notificationToken: string
) {
  const pushMessage: ExpoPushMessage = {
    to: notificationToken,
    title: title,
    body: description,
    sound: "default",
  };

  return pushMessage;
}

/**
 * Creates Expo push messages for all users.
 * @param title - The title of the notification.
 * @param description - The description of the notification.
 * @param notificationTokens - The list of notification tokens.
 * @returns The list of Expo push message objects.
 */
function createExpoPushMessageForAllUsers(
  title: string,
  description: string,
  notificationTokens: string[]
) {
  const messages: ExpoPushMessage[] = [];

  for (const token of notificationTokens) {
    messages.push(createExpoPushMessage(title, description, token));
  }

  return messages;
}

/**
 * Sends a push notification using the Expo push service.
 * @param pushMessage - The Expo push message object.
 * @returns True if the notification was sent successfully, otherwise false.
 */
async function sendPushNotification(pushMessage: ExpoPushMessage) {
  const route = "https://exp.host/--/api/v2/push/send";

  try {
    const response = await fetch(route, {
      method: "POST",
      headers: {
        "Accept": "application/json",
        "Content-Type": "application/json",
        "Accept-encoding": "gzip, deflate",
      },
      body: JSON.stringify(pushMessage),
    });

    if (!response.ok) {
      console.error(
        "Response from ",
        route,
        " is not good: ",
        await response.text()
      );
    }

    return true;
  } catch (error) {
    console.error(
      "Error while sending push notification to user: ",
      "\nError: ",
      error
    );
    return false;
  }
}

/**
 * Sends push notifications to all users.
 * @param expoPushMessages - The list of Expo push message objects.
 * @returns - True if all notifications were sent successfully, otherwise false.
 */
async function sendPushNotificationsToAllUsers(
  expoPushMessages: ExpoPushMessage[]
) {
  try {
    const sendPushNotificationsPromiseResult = await Promise.all(
      expoPushMessages.map((message) => sendPushNotification(message))
    );

    for (const result of sendPushNotificationsPromiseResult) {
      if (!result) {
        console.error("Some of push notifications failed. See above logs.");
      }
    }

    return true;
  } catch (error) {
    console.error(
      "Error while sending push notifications to all users: ",
      error
    );
    return false;
  }
}

export const sendNotificationToFollowers = onRequest(async (req, res) => {
  const {authorization} = req.headers;
  const {title, description, username} = req.body;

  const authResult = handleAdminAuthorization(authorization);
  if (!authResult) {
    res.status(401).send("Unauthorized");
    return;
  }

  const propsResult = checkProps(title, description, username);
  if (!propsResult) {
    res.status(422).send("Invalid Request");
    return;
  }

  const followers = await getFollowersOfUsers(username);
  if (!followers) {
    res.status(500).send("Internal Server Error");
    return;
  }

  const notificationTokens = await getNotificationTokensOfAllUsers(followers);
  if (!notificationTokens) {
    res.status(500).send("Internal Server Error");
    return;
  }

  const notificationObjects = createExpoPushMessageForAllUsers(
    title,
    description,
    notificationTokens
  );
  if (!notificationObjects) {
    res.status(500).send("Internal Server Error");
    return;
  }

  const sendNotificationResult = await sendPushNotificationsToAllUsers(
    notificationObjects
  );
  if (!sendNotificationResult) {
    res.status(500).send("Internal Server Error");
    return;
  }

  res.status(200).send("OK");
  return;
});
