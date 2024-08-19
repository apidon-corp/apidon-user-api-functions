import {onRequest} from "firebase-functions/v2/https";

import getDisplayName from "../../helpers/getDisplayName";
import {
  CommentDataV2,
  CommentInteractionData,
  PostServerData,
} from "../../types/Post";
import {firestore} from "../../firebase/adminApp";
import {FieldValue} from "firebase-admin/firestore";
import {NotificationData} from "../../types/Notifications";
import {internalAPIRoutes, keys} from "../../config";
import {appCheckMiddleware} from "../../middleware/appCheckMiddleware";

async function handleAuthorization(key: string | undefined) {
  if (key === undefined) {
    console.error("Unauthorized attemp to sendReply API.");
    return false;
  }

  const operationFromUsername = await getDisplayName(key);
  if (!operationFromUsername) return false;

  return operationFromUsername;
}

function checkProps(postDocPath: string, message: string) {
  if (!postDocPath || !message) {
    console.error("Both postDocPath and message is undefined.");
    return false;
  }

  return true;
}

function createCommentData(message: string, sender: string, ts: number) {
  const commentData: CommentDataV2 = {
    message: message,
    sender: sender,
    ts: ts,
  };
  return commentData;
}

async function changeCommentsArray(
  postDocPath: string,
  commendData: CommentDataV2
) {
  try {
    const postDocRef = firestore.doc(postDocPath);
    await postDocRef.update({
      comments: FieldValue.arrayUnion(commendData),
    });
    return true;
  } catch (error) {
    console.error("Error while changing comments array: ", error);
    return false;
  }
}

async function increaseCommentCount(postDocPath: string) {
  try {
    const postDocRef = firestore.doc(postDocPath);
    await postDocRef.update({
      commentCount: FieldValue.increment(1),
    });
    return true;
  } catch (error) {
    console.error("Error while increasing comment count: ", error);
    return false;
  }
}

function createCommentInteractionData(postDocPath: string, ts: number) {
  const commentInteractionData: CommentInteractionData = {
    postDocPath: postDocPath,
    creationTime: ts,
  };
  return commentInteractionData;
}

async function updateInteractions(
  commentInteractionData: CommentInteractionData,
  username: string
) {
  try {
    const postInteractionsDoc = firestore.doc(
      `/users/${username}/personal/postInteractions`
    );
    await postInteractionsDoc.update({
      commentedPostsArray: FieldValue.arrayUnion(commentInteractionData),
    });
    return true;
  } catch (error) {
    console.error("Error while updating interactions: ", error);
    return false;
  }
}

function craeteNotificationObject(
  source: string,
  target: string,
  comment: string,
  postDocPath: string,
  timestamp: number
) {
  const notificationObject: NotificationData = {
    type: "comment",
    params: {
      comment: comment,
      commentedPostDocPath: postDocPath,
    },
    source: source,
    target: target,
    timestamp: timestamp,
  };

  return notificationObject;
}

async function getPostSender(postDocPath: string) {
  try {
    const postDocSnapshot = await firestore.doc(postDocPath).get();
    if (!postDocSnapshot.exists) return false;

    const postDocData = postDocSnapshot.data() as PostServerData;
    if (!postDocData) return false;

    const postSender = postDocData.senderUsername;
    if (!postSender) return false;

    return postSender;
  } catch (error) {
    console.error("Error while getting post sender: ", error);
    return false;
  }
}

async function sendNotification(
  username: string,
  postDocPath: string,
  comment: string,
  ts: number
) {
  const postSender = await getPostSender(postDocPath);
  if (!postSender) return false;

  // No notification to yourself.
  if (postSender === username) return true;

  const notificationObject = craeteNotificationObject(
    username,
    postSender,
    comment,
    postDocPath,
    ts
  );

  const notificationAPIKey = keys.NOTIFICATION_API_KEY;

  if (!notificationAPIKey) {
    console.error("Notification API key is undefined fron .env file.");
    return false;
  }

  try {
    const response = await fetch(
      internalAPIRoutes.notification.sendNotification,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "authorization": notificationAPIKey,
        },
        body: JSON.stringify({
          notificationData: notificationObject,
        }),
      }
    );

    if (!response.ok) {
      console.error(
        "Notification API response is not okay: ",
        await response.text()
      );
      return false;
    }

    return true;
  } catch (error) {
    console.error("Error while sending notification: ", error);
    return false;
  }
}

export const postComment = onRequest(
  appCheckMiddleware(async (req, res) => {
    const {authorization} = req.headers;
    const {message, postDocPath} = req.body;

    const username = await handleAuthorization(authorization);
    if (!username) {
      res.status(401).send("Unauthorized");
      return;
    }

    const checkPropsResult = checkProps(postDocPath, message);
    if (!checkPropsResult) {
      res.status(422).send("Invalid Request");
      return;
    }

    const commendData = createCommentData(message, username, Date.now());
    const commentInteractionData = createCommentInteractionData(
      postDocPath,
      commendData.ts
    );

    const [
      changeCommentsArrayResult,
      increaseCommentCountResult,
      updateInteractionsResult,
      sendNotificationResult,
    ] = await Promise.all([
      changeCommentsArray(postDocPath, commendData),
      increaseCommentCount(postDocPath),
      updateInteractions(commentInteractionData, username),
      sendNotification(
        username,
        postDocPath,
        commendData.message,
        commendData.ts
      ),
    ]);

    if (
      !changeCommentsArrayResult ||
      !increaseCommentCountResult ||
      !updateInteractionsResult ||
      !sendNotificationResult
    ) {
      res.status(500).send("Internal Server Error");
      return;
    }

    res.status(200).json({
      commentData: commendData,
    });
    return;
  })
);
