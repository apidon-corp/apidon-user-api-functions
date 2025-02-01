import {onRequest} from "firebase-functions/https";
import {bucket, firestore} from "../../firebase/adminApp";
import getDisplayName from "../../helpers/getDisplayName";
import {NewPostDocData} from "../../types/Post";

import {appCheckMiddleware} from "../../middleware/appCheckMiddleware";

async function handleAuthorization(key: string | undefined) {
  if (key === undefined) {
    console.error("Unauthorized attemp to integrateModel API.");
    return false;
  }

  const operationFromUsername = await getDisplayName(key);
  if (!operationFromUsername) return false;

  return operationFromUsername;
}

function checkProps(postDocPath: string) {
  if (!postDocPath) {
    console.error("postDocPath is undefined to delete.");
    return false;
  }
  return true;
}

async function checkCanDeletePost(postDocPath: string, username: string) {
  try {
    const postDocSnapshot = await firestore.doc(postDocPath).get();

    if (!postDocSnapshot.exists) {
      console.error("postDoc doesn't exist");
      return false;
    }

    const postDocData = postDocSnapshot.data() as NewPostDocData;

    if (!postDocData) {
      console.error("postDocData is undefined");
      return false;
    }

    if (postDocData.collectibleStatus.isCollectible) {
      console.error("Post is a collectible. Can't delete.");
      return false;
    }

    return {
      postServerData: postDocData,
      canDelete: postDocData.senderUsername === username,
    };
  } catch (error) {
    console.error("Error while checking can delete post", error);
    return false;
  }
}

async function deleteStoredFiles(
  postId: string,
  username: string,
  postDocData: NewPostDocData
) {
  if (postDocData.image.length === 0) {
    return true;
  }

  try {
    const postFilesPath = `users/${username}/postFiles/${postId}`;
    await bucket.deleteFiles({
      prefix: postFilesPath + "/",
    });
    return true;
  } catch (error) {
    console.error("Error while deleting stored files", error);
    return false;
  }
}

async function deletePostDoc(postDocPath: string) {
  try {
    const postDocRef = firestore.doc(postDocPath);

    await postDocRef.delete();

    return true;
  } catch (error) {
    console.error("Error while deleting post doc", error);
    return false;
  }
}

async function deletePostDocOnMainPostsCollection(postDocPath: string) {
  try {
    const query = await firestore
      .collection("posts")
      .where("postDocPath", "==", postDocPath)
      .get();

    if (query.empty) {
      console.error("Post is not on main posts collection");
      return false;
    }

    const postDocRef = query.docs[0].ref;
    await postDocRef.delete();

    return true;
  } catch (error) {
    console.error("Error while deleting post doc", error);
    return false;
  }
}

/**
 * For post interactions.
 * @param username
 * @param postDocPath
 * @param timestamp
 * @returns
 */
async function deleteDocFromUploadedPostsCollection(
  username: string,
  postDocPath: string
) {
  try {
    const query = await firestore
      .collection(`users/${username}/personal/postInteractions/uploadedPosts`)
      .where("postDocPath", "==", postDocPath)
      .get();

    if (query.empty) {
      console.error("No such doc in uploadedPosts collection");
      return true;
    }

    const deletedDocRef = query.docs[0];

    await deletedDocRef.ref.delete();

    return true;
  } catch (error) {
    console.error(
      "Error while deleting doc from uploadedPosts collection",
      error
    );
    return false;
  }
}

export const postDelete = onRequest(
  appCheckMiddleware(async (req, res) => {
    const {authorization} = req.headers;
    const {postDocPath} = req.body;

    const username = await handleAuthorization(authorization);
    if (!username) {
      res.status(401).send("UnAuthorized");
      return;
    }

    const checkPropsResult = checkProps(postDocPath);
    if (!checkPropsResult) {
      res.status(422).send("Invalid prop");
      return;
    }

    const checkCanDeleteResult = await checkCanDeletePost(
      postDocPath,
      username
    );
    if (!checkCanDeleteResult) {
      res.status(401).send("UnAuthorized");
      return;
    }
    if (!checkCanDeleteResult.canDelete) {
      res.status(403).send("Forbidden");
      return;
    }

    const postData = checkCanDeleteResult.postServerData;

    const [
      deleteStoredFilesResult,
      deletePostDocResult,
      deletePostDocOnMainPostsCollectionResult,
      deleteDocFromUploadedPostsCollectionResult,
    ] = await Promise.all([
      deleteStoredFiles(postData.id, username, postData),
      deletePostDoc(`/users/${username}/posts/${postData.id}`),
      deletePostDocOnMainPostsCollection(postDocPath),
      deleteDocFromUploadedPostsCollection(username, postDocPath),
    ]);

    if (
      !deleteStoredFilesResult ||
      !deletePostDocResult ||
      !deletePostDocOnMainPostsCollectionResult ||
      !deleteDocFromUploadedPostsCollectionResult
    ) {
      res.status(500).send("Internal Server Error");
      return;
    }

    res.status(200).send("OK");
    return;
  })
);
