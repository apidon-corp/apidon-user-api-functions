import {firestore} from "../../firebase/adminApp";
import {
  ExpoPushMessage,
  NotificationsDocData,
  NotificationSettingsData,
  ReceivedNotificationDocData,
} from "../../types/Notifications";

async function addNotificationDocToRecipient(
  notificationData: ReceivedNotificationDocData
) {
  try {
    const receivedNotificationsCollectionRef = firestore
      .collection("users")
      .doc(notificationData.target)
      .collection("notifications")
      .doc("notifications")
      .collection("receivedNotifications");

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

async function getLastOpenedTime(username: string) {
  try {
    const notificationsDocSnapshot = await firestore
      .collection("users")
      .doc(username)
      .collection("notifications")
      .doc("notifications")
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

    const lastOpenedTime = notificationsDocData.lastOpenedTime;
    if (!lastOpenedTime) {
      console.error("Last opened time doesn't exist for user: ", username);
    }

    return lastOpenedTime;
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

async function badgeCountCalculate(lastOpenedTime: number, target: string) {
  try {
    const unReadReceivedNotificationsQuery = firestore
      .collection("users")
      .doc(target)
      .collection("notifications")
      .doc("notifications")
      .collection("receivedNotifications")
      .where("timestamp", ">=", lastOpenedTime);

    const countData = (
      await unReadReceivedNotificationsQuery.count().get()
    ).data();

    return countData.count;
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
    const notificationDocRef = firestore
      .collection("users")
      .doc(username)
      .collection("notifications")
      .doc("notificationSettings");

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

function createExpoPushMessage(
  notificationData: ReceivedNotificationDocData,
  notificationToken: string,
  badge: number
): ExpoPushMessage | false {
  const {type, source, params} = notificationData;

  // Helper to truncate long text
  const truncate = (text: string, limit: number) =>
    text.length > limit ? `${text.substring(0, limit - 3)}...` : text;

  let pushMessage: ExpoPushMessage;

  switch (type) {
  case "comment": {
    pushMessage = {
      to: notificationToken,
      title: `💬 ${truncate(source, 20)} left a comment`,
      body: truncate(params.comment || "", 100),
      sound: "default",
      badge,
    };
    break;
  }

  case "follow": {
    pushMessage = {
      to: notificationToken,
      title: "👋 New Follower",
      body: `${truncate(
        source,
        30
      )} has started following you. Check out their profile!`,
      sound: "default",
      badge,
    };
    break;
  }

  case "ratePost": {
    const stars = "⭐".repeat(Math.min(params.rate || 0, 5));
    pushMessage = {
      to: notificationToken,
      title: `${stars} Post Rating`,
      body: `${truncate(source, 30)} rated your post ${stars}`,
      sound: "default",
      badge,
    };
    break;
  }

  case "collectibleBought": {
    const isEventCollectible = params.price === 0;

    if (isEventCollectible) {
      pushMessage = {
        to: notificationToken,
        title: "🎁 Event Collectible Claimed!",
        body: `${truncate(source, 30)} claimed your event collectible`,
        sound: "default",
        badge,
      };
    } else {
      const formattedPrice = new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        minimumFractionDigits: 2,
      }).format(params.price || 0);

      pushMessage = {
        to: notificationToken,
        title: "🎉 Collectible Sold!",
        body: `${truncate(
          source,
          30
        )} purchased your collectible for ${formattedPrice}`,
        sound: "default",
        badge,
      };
    }
    break;
  }

  default: {
    console.error(`Invalid notification type: ${type}`);
    return false;
  }
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

async function sendNotification(notificationData: ReceivedNotificationDocData) {
  const addNotificationDocToRecipientResult =
    await addNotificationDocToRecipient(notificationData);

  if (!addNotificationDocToRecipientResult) {
    console.error(
      "Error while adding notification doc to recipient: ",
      notificationData.target
    );
    return false;
  }

  const notificationToken = await getUserNotificationSettings(notificationData);
  if (!notificationToken) {
    console.warn(
      "Couldn't find notification token for user: ",
      notificationData.target
    );
    return true;
  }

  const lastOpenedTime = await getLastOpenedTime(notificationData.target);
  if (!lastOpenedTime) {
    console.error(
      "Error while getting lastOpenedTime for user: ",
      notificationData.target
    );
    return false;
  }

  const badgeCount =
    (await badgeCountCalculate(lastOpenedTime, notificationData.target)) || 0;

  const sendPushNotificationResult = await sendPushNotification(
    notificationData,
    notificationToken,
    badgeCount
  );

  if (!sendPushNotificationResult) {
    console.error(
      "Error while sending push notification to user: ",
      notificationData.target
    );
    return false;
  }

  return true;
}

export {sendNotification};
