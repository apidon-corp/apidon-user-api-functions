import { FieldValue } from "firebase-admin/firestore";
import { onRequest } from "firebase-functions/v2/https";
import { bucket, firestore } from "../../firebase/adminApp";
import getDisplayName from "../../helpers/getDisplayName";
import {
  PostDocPathsArrayItem,
  PostServerData,
  UploadedPostArrayObject,
} from "../../types/Post";

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

function checkProps(description: string, image: string) {
  if (!description && !image) {
    console.error("Both description and image is undefined.");
    return false;
  }
  return true;
}

function createPostServerData(description: string, username: string) {
  const ts = Date.now();

  const newPostServerData: PostServerData = {
    creationTime: ts,
    description: description,
    commentCount: 0,
    image: "",
    ratingCount: 0,
    ratingSum: 0,
    collectibleStatus: { isCollectible: false },
    senderUsername: username,
    id: ts.toString(),
    reviewStatus: "pending",
  };

  return newPostServerData;
}

async function deleteTempFiles(username: string) {
  if (username.length === 0) return true;

  try {
    await bucket.deleteFiles({
      prefix: `users/${username}/postFiles/temp/`,
    });

    return true;
  } catch (error) {
    console.error("Error while deleting temp files: \n", error);
    return false;
  }
}

async function changeLocationOfTempImage(
  username: string,
  tempImageLocation: string
) {
  const postDocId = Date.now().toString();

  try {
    const tempFile = bucket.file(tempImageLocation);
    await tempFile.move(`users/${username}/postFiles/${postDocId}/image`);

    const newFile = bucket.file(
      `users/${username}/postFiles/${postDocId}/image`
    );
    await newFile.makePublic();
    const postImagePublicURL = newFile.publicUrl();

    // Can be continued even this function returns false.
    await deleteTempFiles(username);

    return {
      postDocId: postDocId,
      postImagePublicURL: postImagePublicURL,
    };
  } catch (error) {
    console.error("Error on using temp image on Firebase Storage: \n", error);
    return false;
  }
}

async function createPostOnFirestore(
  postServerData: PostServerData,
  username: string
) {
  try {
    await firestore.doc(`/users/${username}/posts/${postServerData.id}`).set({
      ...postServerData,
    });
    return true;
  } catch (error) {
    console.error("Error on creating post on Firestore Database.");
    return false;
  }
}

async function updateUploadedPostArray(
  username: string,
  postDocPath: string,
  timestamp: number
) {
  try {
    const newUploadedPostObject: UploadedPostArrayObject = {
      postDocPath: postDocPath,
      timestamp: timestamp,
    };

    const postInteractionsDocRef = firestore.doc(
      `users/${username}/personal/postInteractions`
    );

    await postInteractionsDocRef.update({
      uploadedPostArray: FieldValue.arrayUnion(newUploadedPostObject),
    });
  } catch (error) {
    console.error("Error while updating uploadedPostArray");
    return false;
  }

  return true;
}

async function updatePostDocPathsArray(postDocPath: string, timestamp: number) {
  const postDocPathsArrayItem: PostDocPathsArrayItem = {
    postDocPath: postDocPath,
    timestamp: timestamp,
  };

  try {
    const postsDocRef = firestore.doc("posts/posts");
    await postsDocRef.update({
      postDocPaths: FieldValue.arrayUnion(postDocPathsArrayItem),
    });

    return true;
  } catch (error) {
    console.error("Error while updating postDocPathsArray: \n", error);
    return false;
  }
}

export const postUpload = onRequest(
  appCheckMiddleware(async (req, res) => {
    const { authorization } = req.headers;
    const { description, tempImageLocation } = req.body;

    const username = await handleAuthorization(authorization);
    if (!username) {
      res.status(401).send("Unauthorized");
      return;
    }

    const checkPropsResult = checkProps(description, tempImageLocation);
    if (!checkPropsResult) {
      res.status(422).send("Invalid Request");
      return;
    }

    let postServerData = createPostServerData(description, username);

    if (tempImageLocation) {
      const imageUploadResult = await changeLocationOfTempImage(
        username,
        tempImageLocation
      );
      if (!imageUploadResult) {
        res.status(500).send("Internal Server Error");
        return;
      }

      postServerData = {
        ...postServerData,
        id: imageUploadResult.postDocId,
        image: imageUploadResult.postImagePublicURL,
      };
    }

    const [
      createPostOnFirestoreResult,
      updateUploadedPostArrayResult,
      updatePostDocPathsArrayResult,
    ] = await Promise.all([
      createPostOnFirestore(postServerData, username),
      updateUploadedPostArray(
        username,
        `users/${username}/posts/${postServerData.id}`,
        postServerData.creationTime
      ),
      updatePostDocPathsArray(
        `users/${username}/posts/${postServerData.id}`,
        postServerData.creationTime
      ),
    ]);

    if (
      !createPostOnFirestoreResult ||
      !updateUploadedPostArrayResult ||
      !updatePostDocPathsArrayResult
    ) {
      res.status(500).send("Internal Server Error");
      return;
    }

    res.status(200).json({
      newPostData: postServerData,
      newPostDocId: postServerData.id,
    });

    return;
  })
);
