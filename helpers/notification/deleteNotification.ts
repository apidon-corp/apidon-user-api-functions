import {firestore} from "../../firebase/adminApp";
import {ReceivedNotificationDocData} from "../../types/Notifications";

async function deleteNotificationObject(
  notificationData: ReceivedNotificationDocData
) {
  try {
    const query = await firestore
      .collection("users")
      .doc(notificationData.target)
      .collection("notifications")
      .doc("notifications")
      .collection("receivedNotifications")
      .where("timestamp", "==", notificationData.timestamp)
      .where("type", "==", notificationData.type)
      .where("source", "==", notificationData.source)
      .get();

    const deletedDoc = query.docs[0];

    if (!deletedDoc) {
      console.error("Notification object not found to delete");
      return false;
    }

    await deletedDoc.ref.delete();

    return true;
  } catch (error) {
    console.error("Error on deleting notification doc.: ", error);
    return false;
  }
}

async function deleteNotification(
  notificationDocData: ReceivedNotificationDocData
) {
  const deleteNotificationObjectResult = await deleteNotificationObject(
    notificationDocData
  );
  if (!deleteNotificationObjectResult) {
    console.error("Error on deleting notification object");
    return false;
  }
  return true;
}

export {deleteNotification};
