import {FieldValue} from "firebase-admin/firestore";
import {onRequest} from "firebase-functions/v2/https";
import {internalAPIRoutes} from "../../helpers/internalApiRoutes";
import {firestore} from "../../firebase/adminApp";
import getDisplayName from "../../helpers/getDisplayName";
import {ReceivedNotificationDocData} from "../../types/Notifications";
import {CommentServerData, PostServerData} from "../../types/Post";

import {getConfigObject} from "../../configs/getConfigObject";
import {appCheckMiddleware} from "../../middleware/appCheckMiddleware";

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

function checkProps(postDocPath: string, commentObject: CommentServerData) {
  if (!postDocPath || !commentObject) {
    console.error("Both postDocPath and commentObject is undefined.");
    return false;
  }

  return true;
}

async function checkCanDeleteComment(
  username: string,
  postDocPath: string,
  commentObject: CommentServerData
) {
  try {
    const query = await firestore
      .collection(`${postDocPath}/comments`)
      .where("sender", "==", username)
      .where("ts", "==", commentObject.ts)
      .get();

    if (query.empty) {
      console.error(
        "Comment not found or user not authorized to delete this comment."
      );
      return false;
    }

    const commentDocPath = query.docs[0].ref.path;

    const postDocSnapshot = await firestore.doc(postDocPath).get();
    if (!postDocSnapshot.exists) {
      console.error("Post document does not exist.");
      return false;
    }

    const postDocData = postDocSnapshot.data() as PostServerData;
    return {
      postDocData: postDocData,
      commentDocPath: commentDocPath,
    };
  } catch (error) {
    console.error("Error while checking if comment can be deleted:", error);
    return false;
  }
}

async function deleteCommentDoc(commentDocPath: string) {
  try {
    await firestore.doc(commentDocPath).delete();
    return true;
  } catch (error) {
    console.error("Error while deleting comment doc.");
    return false;
  }
}

async function decreaseCommentCount(postDocPath: string) {
  try {
    const postDocRef = firestore.doc(postDocPath);
    await postDocRef.update({
      commentCount: FieldValue.increment(-1),
    });
    return true;
  } catch (error) {
    console.error("Error while decreasing comment count");
    return false;
  }
}

async function deleteInteractionDocFromCommentsCollection(
  username: string,
  commentObject: CommentServerData,
  postDocPath: string
) {
  try {
    const query = await firestore
      .collection(`users/${username}/personal/postInteractions/comments`)
      .where("postDocPath", "==", postDocPath)
      .where("creationTime", "==", commentObject.ts)
      .get();

    if (query.empty) {
      console.error("Comment interaction doc not found.");
      return true;
    }

    const deletedDocRef = query.docs[0].ref;

    await deletedDocRef.delete();

    return true;
  } catch (error) {
    console.error("Error while deleting comment interaction doc: ", error);
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

async function deleteNotification(
  postSender: string,
  commentObject: CommentServerData,
  postDocPath: string
) {
  // No notification to yourself.
  if (postSender === commentObject.sender) return true;

  const notificationDataToDelete = craeteNotificationObject(
    commentObject.sender,
    postSender,
    commentObject.message,
    postDocPath,
    commentObject.ts
  );

  if (!configObject) {
    console.error("Config object is undefined");
    return false;
  }

  const notificationAPIKey = configObject.NOTIFICATION_API_KEY;

  if (!notificationAPIKey) {
    console.error("Notification API key is undefined fron config file.");
    return false;
  }

  try {
    const response = await fetch(
      internalAPIRoutes.notification.deleteNotification,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "authorization": notificationAPIKey,
        },
        body: JSON.stringify({
          notificationData: notificationDataToDelete,
        }),
      }
    );

    if (!response.ok) {
      console.error(
        "Delete Notification API response is not okay: ",
        await response.text()
      );
      return false;
    }

    return true;
  } catch (error) {
    console.error("Error while deleting notification: ", error);
    return false;
  }
}

export const postCommentDelete = onRequest(
  appCheckMiddleware(async (req, res) => {
    const {authorization} = req.headers;
    const {postDocPath, commentObject} = req.body;

    const username = await handleAuthorization(authorization);
    if (!username) {
      res.status(401).send("Unauthorized");
      return;
    }

    const checkPropsResult = checkProps(postDocPath, commentObject);
    if (!checkPropsResult) {
      res.status(422).send("Invalid Request");
      return;
    }

    const checkCanDeleteCommentResult = await checkCanDeleteComment(
      username,
      postDocPath,
      commentObject
    );
    if (!checkCanDeleteCommentResult) {
      res.status(500).send("Internal Server Error");
      return;
    }

    if (!checkCanDeleteCommentResult) {
      res.status(403).send("Forbidden");
      return;
    }

    const [
      deleteCommentFromPostResult,
      decreaseCommentCountResult,
      deleteInteractionDocFromCommentsCollectionResult,
      deleteNotificationResult,
    ] = await Promise.all([
      deleteCommentDoc(checkCanDeleteCommentResult.commentDocPath),
      decreaseCommentCount(postDocPath),
      deleteInteractionDocFromCommentsCollection(
        username,
        commentObject,
        postDocPath
      ),
      deleteNotification(
        checkCanDeleteCommentResult.postDocData.senderUsername,
        commentObject,
        postDocPath
      ),
    ]);

    if (
      !deleteCommentFromPostResult ||
      !deleteInteractionDocFromCommentsCollectionResult ||
      !deleteNotificationResult ||
      !decreaseCommentCountResult
    ) {
      res.status(500).send("Internal Server Error");
      return;
    }

    res.status(200).send("Success");
    return;
  })
);
