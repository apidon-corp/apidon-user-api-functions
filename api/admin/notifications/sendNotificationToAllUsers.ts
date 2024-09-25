import {onRequest} from "firebase-functions/v2/https";
import {firestore} from "../../../firebase/adminApp";
import {
  ExpoPushMessage,
  NotificationSettingsData,
} from "../../../types/Notifications";
import {getConfigObject} from "../../../configs/getConfigObject";

const configObject = getConfigObject();

if (!configObject) {
  throw new Error("Config object is undefined");
}

/**
 * Handles the authorization of incoming requests.
 * @param authorization - The authorization header value.
 * @returns True if the authorization is valid, otherwise false.
 */
function handleAuthorization(authorization: string | undefined) {
  if (!authorization) {
    console.error("Authorization header is missing");
    return false;
  }

  if (!configObject) {
    console.error("Config object is undefined");
    return false;
  }

  return authorization === configObject.ADMIN;
}

/**
 * Checks the presence of required properties.
 * @param title The title of the notification.
 * @param description - The description of the notification.
 * @returns True if both title and description are present, otherwise false.
 */
function checkProps(title: string, description: string) {
  if (!title || !description) {
    console.error("Title or description is missing");
    return false;
  }

  return true;
}

/**
 * Fetches all usernames from the Firestore collection.
 * @returns A list of usernames or false if an error occurs.
 */
async function getAllUsers() {
  try {
    const usernameCollectionSnapshot = await firestore
      .collection("usernames")
      .get();
    const usernames = usernameCollectionSnapshot.docs.map((doc) => doc.id);
    return usernames;
  } catch (error) {
    console.error("Error on getting all usernames: ", error);
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

export const sendNotificationToAllUsers = onRequest(async (req, res) => {
  const {authorization} = req.headers;
  const {title, description} = req.body;

  const authResult = handleAuthorization(authorization);
  if (!authResult) {
    res.status(401).send("Unauthorized");
    return;
  }

  const propsResult = checkProps(title, description);
  if (!propsResult) {
    res.status(422).send("Invalid Request");
    return;
  }

  const allUsers = await getAllUsers();
  if (!allUsers) {
    res.status(500).send("Internal Server Error");
    return;
  }

  const notificationTokens = await getNotificationTokensOfAllUsers(allUsers);
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
