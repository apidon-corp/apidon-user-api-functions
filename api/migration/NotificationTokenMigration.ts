import { keys } from "../../config";
import { onRequest } from "firebase-functions/v2/https";
import { firestore } from "../../firebase/adminApp";
import { FieldValue, WriteBatch } from "firebase-admin/firestore";
import { NotificationSettingsData } from "../../types/Notifications";

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

  return authorization === keys.MIGRATION_API_KEY;
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

async function getNotificationToken(username: string) {
  try {
    const notificationDocSnapshot = await firestore
      .doc(`users/${username}/notifications/notifications`)
      .get();

    if (!notificationDocSnapshot.exists) {
      console.error("Notification doc doesn't exist for user: ", username);
      return false;
    }

    const data = notificationDocSnapshot.data();

    if (!data) {
      console.error("Notification data doesn't exist for user: ", username);
      return false;
    }

    const notificationToken = (data.notificationToken as string) || "";

    return {
      username: username,
      notificationToken: notificationToken,
    };
  } catch (error) {
    console.error("Error on getting notification token for user: ", username);
    return false;
  }
}

async function getNotificationTokenOfAllUsers(users: string[]) {
  try {
    const results = await Promise.all(
      users.map((user) => getNotificationToken(user))
    );

    const filtered = results.filter((result) => result) as {
      username: string;
      notificationToken: string;
    }[];

    return filtered;
  } catch (error) {
    console.error("Error on getting notification tokens of all users: ", error);
    return false;
  }
}

function createNotificationSettingsDoc(
  batch: WriteBatch,
  username: string,
  notificationToken: string
) {
  const notificationSettingsDocRef = firestore.doc(
    `users/${username}/notifications/notificationSettings`
  );
  const data: NotificationSettingsData = {
    notificationToken: notificationToken,
  };
  batch.set(notificationSettingsDocRef, data);
}

function updateNotificationsDoc(batch: WriteBatch, username: string) {
  const notificationDocRef = firestore.doc(
    `users/${username}/notifications/notifications`
  );
  batch.update(notificationDocRef, {
    notificationToken: FieldValue.delete(),
  });
}

async function updateUser(username: string, notificationToken: string) {
  const batch = firestore.batch();

  createNotificationSettingsDoc(batch, username, notificationToken);
  updateNotificationsDoc(batch, username);

  try {
    await batch.commit();
    return true;
  } catch (error) {
    console.error("Error on updating user: ", username, error);
    return false;
  }
}

async function updateAllUsers(
  users: {
    username: string;
    notificationToken: string;
  }[]
) {
  try {
    await Promise.all(
      users.map((user) => updateUser(user.username, user.notificationToken))
    );
    return true;
  } catch (error) {
    console.error("Error on updating all users: ", error);
    return false;
  }
}

export const notificationTokenMigration = onRequest(async (req, res) => {
  const { authorization } = req.headers;

  const authResult = handleAuthorization(authorization);
  if (!authResult) {
    res.status(401).send("Unauthorized");
    return;
  }

  const users = await getAllUsers();
  if (!users) {
    res.status(500).send("Internal Server Error");
    return;
  }

  const notificationTokens = await getNotificationTokenOfAllUsers(users);
  if (!notificationTokens) {
    res.status(500).send("Internal Server Error");
    return;
  }

  const updateResult = await updateAllUsers(notificationTokens);
  if (!updateResult) {
    res.status(500).send("Internal Server Error");
    return;
  }
  res.status(200).send("OK");
  return;
});
