import {onRequest} from "firebase-functions/https";
import {firestore} from "../../../firebase/adminApp";
import {
  ExpoPushMessage,
  NotificationsDocData,
  NotificationSettingsData,
  ReceivedNotificationDocData,
} from "../../../types/Notifications";

import {defineSecret} from "firebase-functions/params";
const notificationAPIKeySecret = defineSecret("NOTIFICATION_API_KEY");

function handleAuthorization(
  key: string | undefined,
  notificationAPIKey: string
) {
  if (key === undefined) {
    console.error("Unauthorized attemp to sendNotification API.");
    return false;
  }

  return key === notificationAPIKey;
}

async function addNotificationDocToRecipient(
  notificationData: ReceivedNotificationDocData
) {
  try {
    const receivedNotificationsCollectionRef = firestore.collection(
      `/users/${notificationData.target}/notifications/notifications/receivedNotifications`
    );

    await receivedNotificationsCollectionRef.add(notificationData);

    return true;
  } catch (error) {
    console.error(
      "Error on creating new notification doc for recipient: ",
      error
    );
    return false;
  }
}

async function getNotificationsDocData(username: string) {
  try {
    const notificationsDocSnapshot = await firestore
      .doc(`/users/${username}/notifications/notifications`)
      .get();

    if (!notificationsDocSnapshot.exists) {
      console.error("Notifications doc doesn't exist for user: ", username);
      return false;
    }

    const notificationsDocData =
      notificationsDocSnapshot.data() as NotificationsDocData;

    if (!notificationsDocData) {
      console.error(
        "Notifications doc data doesn't exist for user: ",
        username
      );
      return false;
    }

    return notificationsDocData;
  } catch (error) {
    console.error(
      "Error while getting notification doc data for user: ",
      username,
      "\nError: ",
      error
    );
    return false;
  }
}

async function badgeCountCalculate(
  notificationsDocData: NotificationsDocData,
  target: string
) {
  try {
    const receivedNotificationsCollection = await firestore
      .collection(
        `users/${target}/notifications/notifications/receivedNotifications`
      )
      .where("timestamp", ">=", notificationsDocData.lastOpenedTime)
      .get();

    return receivedNotificationsCollection.size;
  } catch (error) {
    console.error("Error while calculating badge count: ", error);
    return false;
  }
}

async function getUserNotificationSettings(
  notificationData: ReceivedNotificationDocData
) {
  const username = notificationData.target;
  if (!username) {
    console.error("Username not found in notification data.");
    return false;
  }

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

    return {
      notificationToken: notificationToken,
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
  notificationData: ReceivedNotificationDocData,
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
  notificationData: ReceivedNotificationDocData,
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
      notificationData.target,
      "\nError: ",
      error
    );
    return false;
  }
}

export const sendNotification = onRequest(
  {secrets: [notificationAPIKeySecret]},
  async (req, res) => {
    const {authorization} = req.headers;

    const {notificationData} = req.body as {
      notificationData: ReceivedNotificationDocData;
    };

    const isAuthorized = handleAuthorization(
      authorization,
      notificationAPIKeySecret.value()
    );
    if (!isAuthorized) {
      res.status(401).send("Unauthorized");
      return;
    }

    const addNotificationDocToRecipientResult =
      await addNotificationDocToRecipient(notificationData);
    if (!addNotificationDocToRecipientResult) {
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

    const notificationsDocData = await getNotificationsDocData(
      notificationData.target
    );
    if (!notificationsDocData) {
      res.status(500).send("Internal Server Error");
      return;
    }
    const badgeCount =
      (await badgeCountCalculate(
        notificationsDocData,
        notificationData.target
      )) || 0;

    const sendPushNotificationResult = await sendPushNotification(
      notificationData,
      userNotificationSettings.notificationToken,
      badgeCount
    );
    if (!sendPushNotificationResult) {
      res.status(500).send("Internal Server Error");
      return;
    }

    res.status(200).send("OK");
    return;
  }
);
