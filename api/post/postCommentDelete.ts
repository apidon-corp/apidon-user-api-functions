import { onRequest } from "firebase-functions/v2/https";
import getDisplayName from "../../helpers/getDisplayName";
import {
  CommentDataV2,
  CommentInteractionData,
  PostServerDataV3,
} from "../../types/Post";
import { firestore } from "../../firebase/adminApp";
import { FieldValue } from "firebase-admin/firestore";
import { NotificationData } from "../../types/Notifications";
import { internalAPIRoutes, keys } from "../../config";

import { appCheckMiddleware } from "../../middleware/appCheckMiddleware";

async function handleAuthorization(key: string | undefined) {
  if (key === undefined) {
    console.error("Unauthorized attemp to sendReply API.");
    return false;
  }

  const operationFromUsername = await getDisplayName(key);
  if (!operationFromUsername) return false;

  return operationFromUsername;
}

function checkProps(postDocPath: string, commentObject: CommentDataV2) {
  if (!postDocPath || !commentObject) {
    console.error("Both postDocPath and commentObject is undefined.");
    return false;
  }

  return true;
}

async function checkCanDeleteComment(
  username: string,
  postDocPath: string,
  commentObject: CommentDataV2
) {
  try {
    const postDocSnapshot = await firestore.doc(postDocPath).get();
    if (!postDocSnapshot.exists) {
      console.error("Post doc not found");
      return false;
    }

    const postDocData = postDocSnapshot.data() as PostServerDataV3;
    if (!postDocData) {
      console.error("Post doc data is undefined");
      return false;
    }

    const foundComment = postDocData.comments.find(
      (comment) =>
        comment.message === commentObject.message &&
        comment.sender === commentObject.sender &&
        comment.ts === commentObject.ts
    );

    if (!foundComment) {
      console.error("Comment not found to delete");
      return false;
    }

    return {
      postDocData: postDocData,
      canDeleteComment: foundComment.sender === username,
    };
  } catch (error) {
    console.error("Error while checking can delete comment");
    return false;
  }
}

async function deleteCommentFromPost(
  postDocPath: string,
  commentObject: CommentDataV2
) {
  try {
    const postDocRef = firestore.doc(postDocPath);
    await postDocRef.update({
      comments: FieldValue.arrayRemove(commentObject),
    });
    return true;
  } catch (error) {
    console.error("Error while deleting comment from post");
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

async function deleteCommentFromInteractions(
  username: string,
  commentObject: CommentDataV2,
  postDocPath: string
) {
  const commentInteractionData: CommentInteractionData = {
    creationTime: commentObject.ts,
    postDocPath: postDocPath,
  };

  try {
    const postInteractionsDoc = firestore.doc(
      `/users/${username}/personal/postInteractions`
    );

    await postInteractionsDoc.update({
      commentedPostsArray: FieldValue.arrayRemove(commentInteractionData),
    });

    return true;
  } catch (error) {
    console.error("Error while deleting comment from interactions");
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

async function deleteNotification(
  postSender: string,
  commentObject: CommentDataV2,
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

  const notificationAPIKey = keys.NOTIFICATION_API_KEY;

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
          authorization: notificationAPIKey,
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
    const { authorization } = req.headers;
    const { postDocPath, commentObject } = req.body;

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

    if (!checkCanDeleteCommentResult.canDeleteComment) {
      res.status(403).send("Forbidden");
      return;
    }

    const [
      deleteCommentFromPostResult,
      decreaseCommentCountResult,
      deleteCommentFromInteractionsResult,
      deleteNotificationResult,
    ] = await Promise.all([
      deleteCommentFromPost(postDocPath, commentObject),
      decreaseCommentCount(postDocPath),
      deleteCommentFromInteractions(
        username,
        commentObject,
        `/users/${checkCanDeleteCommentResult.postDocData.senderUsername}/posts/${checkCanDeleteCommentResult.postDocData.id}`
      ),
      deleteNotification(
        checkCanDeleteCommentResult.postDocData.senderUsername,
        commentObject,
        postDocPath
      ),
    ]);

    if (
      !deleteCommentFromPostResult ||
      !deleteCommentFromInteractionsResult ||
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
