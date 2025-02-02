import {FieldValue} from "firebase-admin/firestore";
import {onRequest} from "firebase-functions/https";
import {firestore} from "../../firebase/adminApp";
import getDisplayName from "../../helpers/getDisplayName";

import {appCheckMiddleware} from "../../middleware/appCheckMiddleware";
import {CommentInteractionDocData} from "../../types/Interactions";
import {ReceivedNotificationDocData} from "../../types/Notifications";
import {CommentServerData, NewPostDocData} from "../../types/Post";

import {sendNotification} from "../../helpers/notification/sendNotification";

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

/**
 * For post interactions.
 * @param commentInteractionData
 * @param username
 * @returns
 */
async function addInteractionDocToCommentsCollection(
  commentInteractionData: CommentInteractionDocData,
  username: string
) {
  try {
    const commentsCollectionRef = firestore.collection(
      `users/${username}/personal/postInteractions/comments`
    );
    await commentsCollectionRef.add(commentInteractionData);
    return true;
  } catch (error) {
    console.error(
      "Error while adding interaction doc to comments collection: ",
      error
    );
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

    const postDocData = postDocSnapshot.data() as NewPostDocData;
    if (!postDocData) return false;

    const postSender = postDocData.senderUsername;
    if (!postSender) return false;

    return postSender;
  } catch (error) {
    console.error("Error while getting post sender: ", error);
    return false;
  }
}

async function handleNotification(
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

  const sendNotificationResult = await sendNotification(notificationObject);
  if (!sendNotificationResult) {
    console.error("Error while sending notification. See other logs.");
    return false;
  }
  return true;
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

    const commentData = createCommentData(message, username, Date.now());

    await Promise.all([
      createCommentDoc(postDocPath, commentData),
      increaseCommentCount(postDocPath),
      addInteractionDocToCommentsCollection(
        {creationTime: commentData.ts, postDocPath: postDocPath},
        username
      ),
      handleNotification(
        username,
        postDocPath,
        commentData.message,
        commentData.ts
      ),
    ]);

    res.status(200).json({
      commentData: commentData,
    });
  })
);
