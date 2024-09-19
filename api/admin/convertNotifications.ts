import {onRequest} from "firebase-functions/v2/https";

import {firestore} from "../../firebase/adminApp";

import {
  NotificationDocData,
  ReceivedNotificationDocData,
} from "../../types/Notifications";
import {FieldValue} from "firebase-admin/firestore";

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

async function convertOneUser(username: string) {
  try {
    const notificatiosnDoc = await firestore
      .doc(`users/${username}/notifications/notifications`)
      .get();

    if (!notificatiosnDoc.exists) {
      console.error("Notifications doc doesn't exist for user: ", username);
      return true;
    }

    const notificationsDocData = notificatiosnDoc.data() as NotificationDocData;

    const notifications = notificationsDocData.notifications;

    const results = await Promise.all([
      notifications.map((n) =>
        addDocToReceivedNotificationsCollection(n, username)
      ),
    ]);

    if (!results.every((r) => r)) {
      console.error(
        "Error on adding docs to received notifications collection for user: ",
        username
      );
      return false;
    }

    await notificatiosnDoc.ref.update({
      notifications: FieldValue.delete(),
    });

    return true;
  } catch (error) {
    console.error("Error on converting one user: ", error);
    return false;
  }
}

async function addDocToReceivedNotificationsCollection(
  receivedNotificationDocData: ReceivedNotificationDocData,
  username: string
) {
  try {
    const receivedNotificationsCollectionRef = firestore.collection(
      `users/${username}/notifications/notifications/receivedNotifications`
    );
    await receivedNotificationsCollectionRef.add(receivedNotificationDocData);
  } catch (error) {
    console.error(
      "Error on adding doc to received notifications collection: ",
      error
    );
  }
}

async function convertAllUsers(usernames: string[]) {
  try {
    const results = await Promise.all(
      usernames.map((username) => convertOneUser(username))
    );
    if (!results.every((r) => r)) {
      console.error("Error on converting all users");
      return false;
    }
    return true;
  } catch (error) {
    console.error("Error on converting all users: ", error);
    return false;
  }
}

export const convertNotifications = onRequest(async (req, res) => {
  const usernames = await getAllUsers();
  if (!usernames) {
    res.status(500).send("Internal Server Error");
    return;
  }

  const result = await convertAllUsers(usernames);
  if (!result) {
    res.status(500).send("Internal Server Error");
    return;
  }

  res.status(200).send("OK");
});
