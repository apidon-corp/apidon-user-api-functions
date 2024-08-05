import { onRequest } from "firebase-functions/v2/https";

import { firestore } from "../../../firebase/adminApp";
import { FieldValue as fieldValue } from "firebase-admin/firestore";

import {
  ExpoPushMessage,
  NotificationData,
  NotificationDocData,
} from "../../../types/Notifications";

import { keys } from "../../../config";

function handleAuthorization(key: string | undefined) {
  if (key === undefined) {
    console.error("Unauthorized attemp to sendNotification API.");
    return false;
  }

  const notificationAPIKey = keys.NOTIFICATION_API_KEY;

  if (!notificationAPIKey) {
    console.error("Notification API key not found from .env file.");
    return false;
  }

  return key === notificationAPIKey;
}

async function updateNotificationDocOfRecipient(
  notificationData: NotificationData
) {
  try {
    const notificationDocRef = firestore.doc(
      `/users/${notificationData.target}/notifications/notifications`
    );

    await notificationDocRef.update({
      notifications: fieldValue.arrayUnion(notificationData),
    });

    return true;
  } catch (error) {
    console.error("Error on updating notifications doc of recipient: ", error);
    return false;
  }
}

function badgeCountCalculate(notificationDocData: NotificationDocData) {
  return notificationDocData.notifications.reduce((acc, current) => {
    if (current.timestamp > notificationDocData.lastOpenedTime) {
      return acc + 1;
    } else {
      return acc;
    }
  }, 0);
}

async function getUserNotificationSettings(notificationData: NotificationData) {
  const username = notificationData.target;
  if (!username) {
    console.error("Username not found in notification data.");
    return false;
  }

  try {
    const notificationDocSnapshot = await firestore
      .doc(`/users/${username}/notifications/notifications`)
      .get();

    if (!notificationDocSnapshot.exists) {
      console.error("Notification doc doesn't exist for user: ", username);
      return false;
    }

    const notificationDocData =
      notificationDocSnapshot.data() as NotificationDocData;

    const notificationToken = notificationDocData.notificationToken;

    if (!notificationToken) {
      console.error("Notification token doesn't exist for user: ", username);
      return false;
    }

    return {
      notificationToken: notificationToken,
      badgeCount: badgeCountCalculate(notificationDocData),
    };
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

function createExpoPushMessage(
  notificationData: NotificationData,
  notificationToken: string,
  badge: number
) {
  let pushMessage: ExpoPushMessage;
  if (notificationData.type === "comment") {
    pushMessage = {
      to: notificationToken,
      title: "New Comment Alert!",
      body: `${notificationData.source} commented: "${notificationData.params.comment}"`,
      sound: "default",
      badge: badge,
    };
  } else if (notificationData.type === "follow") {
    pushMessage = {
      to: notificationToken,
      title: "You Have a New Follower!",
      body: `${notificationData.source} started following you`,
      sound: "default",
      badge: badge,
    };
  } else if (notificationData.type === "ratePost") {
    pushMessage = {
      to: notificationToken,
      title: "Your Post Got Rated!",
      body: `${notificationData.source} rated your post: ${notificationData.params.rate} ⭐️`,
      sound: "default",
      badge: badge,
    };
  } else if (notificationData.type === "collectibleBought") {
    pushMessage = {
      to: notificationToken,
      title: "Your Collectible Bought!",
      body: `${notificationData.source} bought your collectible for $${notificationData.params.price}`,
      sound: "default",
      badge: badge,
    };
  } else {
    console.error("Invalid notification type.");
    return false;
  }

  return pushMessage;
}

async function sendPushNotification(
  notificationData: NotificationData,
  notificationToken: string,
  badgeCount: number
) {
  const pushMessage = createExpoPushMessage(
    notificationData,
    notificationToken,
    badgeCount
  );

  const route = "https://exp.host/--/api/v2/push/send";

  try {
    const response = await fetch(route, {
      method: "POST",
      headers: {
        Accept: "application/json",
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
      notificationData.target,
      "\nError: ",
      error
    );
    return false;
  }
}

export const sendNotification = onRequest(async (req, res) => {
  const { authorization } = req.headers;

  const { notificationData } = req.body;

  const isAuthorized = handleAuthorization(authorization);
  if (!isAuthorized) {
    res.status(401).send("Unauthorized");
    return;
  }

  const updateNotificationDocResult = await updateNotificationDocOfRecipient(
    notificationData
  );
  if (!updateNotificationDocResult) {
    res.status(500).send("Internal Server Error");
    return;
  }

  const userNotificationSettings = await getUserNotificationSettings(
    notificationData
  );
  if (!userNotificationSettings) {
    console.warn(
      "Couldn't find notification token for user: ",
      notificationData.target
    );
    res.status(200).send("OK");
    return;
  }

  const sendPushNotificationResult = await sendPushNotification(
    notificationData,
    userNotificationSettings.notificationToken,
    userNotificationSettings.badgeCount
  );
  if (!sendPushNotificationResult) {
    res.status(500).send("Internal Server Error");
    return;
  }

  res.status(200).send("OK");
  return;
});
