import {onRequest} from "firebase-functions/v2/https";

import {FieldValue} from "firebase-admin/firestore";
import {internalAPIRoutes} from "../../config";
import {getConfigObject} from "../../configs/getConfigObject";
import {firestore} from "../../firebase/adminApp";
import getDisplayName from "../../helpers/getDisplayName";
import {appCheckMiddleware} from "../../middleware/appCheckMiddleware";
import {ReceivedNotificationDocData} from "../../types/Notifications";
import {
  CommentInteractionData,
  CommentServerData,
  PostServerData,
} from "../../types/Post";

const configObject = getConfigObject();

if (!configObject) {
  throw new Error("Config object is undefined");
}

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
  const commentData: CommentServerData = {
    message: message,
    sender: sender,
    ts: ts,
  };
  return commentData;
}

async function createCommentDoc(
  postDocPath: string,
  commendData: CommentServerData
) {
  try {
    const postCommentsCollectionRef = firestore.collection(
      `${postDocPath}/comments`
    );
    await postCommentsCollectionRef.add(commendData);
    return true;
  } catch (error) {
    console.error(
      "Error while creating comment doc in comments collection: ",
      error
    );
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
  const notificationObject: ReceivedNotificationDocData = {
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

  if (!configObject) {
    console.error("Config object is undefined");
    return false;
  }

  const notificationAPIKey = configObject.NOTIFICATION_API_KEY;

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
      createCommentDocResult,
      increaseCommentCountResult,
      updateInteractionsResult,
      sendNotificationResult,
    ] = await Promise.all([
      createCommentDoc(postDocPath, commendData),
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
      !createCommentDocResult ||
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
