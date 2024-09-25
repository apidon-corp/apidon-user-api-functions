import {onRequest} from "firebase-functions/v2/https";
import {firestore} from "../../firebase/adminApp";

import {
  CommentInteractionDocData,
  PostInteractions,
  UploadedPostArrayObject,
} from "../../types/Interactions";
import {FieldValue} from "firebase-admin/firestore";

import {getConfigObject} from "../../configs/getConfigObject";

const configObject = getConfigObject();

if (!configObject) {
  throw new Error("Config object is undefined");
}

/**
 * Handles the authorization of incoming requests.
 * @param authorization - The authorization header value.
 * @returns True if the authorization is valid, otherwise false.
 */
function handleAuthorization(authorization: string | undefined) {
  if (!authorization) {
    console.error("Authorization header is missing");
    return false;
  }

  if (!configObject) {
    console.error("Config object is undefined");
    return false;
  }

  return authorization === configObject.ADMIN_NOTIFICATIONS_API_KEY;
}

/**
 * Fetches all usernames from the Firestore collection.
 * @returns A list of usernames or false if an error occurs.
 */
async function getAllUsers() {
  try {
    const usernameCollectionSnapshot = await firestore
      .collection("usernames")
      .get();
    const usernames = usernameCollectionSnapshot.docs.map((doc) => doc.id);
    return usernames;
  } catch (error) {
    console.error("Error on getting all usernames: ", error);
    return false;
  }
}

async function addDocToCommentsCollection(
  commentInteractionData: CommentInteractionDocData,
  username: string
) {
  try {
    const commentsCollectionRef = `users/${username}/personal/postInteractions/comments`;
    await firestore
      .collection(commentsCollectionRef)
      .add(commentInteractionData);
    return true;
  } catch (error) {
    console.error("Error on adding doc to comments collection: ", error);
    return false;
  }
}

async function convertOneUserComments(
  username: string,
  commentedPostsArray: PostInteractions["commentedPostsArray"],
  postInteractionsDocRef: FirebaseFirestore.DocumentReference
) {
  try {
    const results = await Promise.all(
      commentedPostsArray.map((c) => addDocToCommentsCollection(c, username))
    );
    if (!results) {
      console.error("Error on converting comments");
      return false;
    }
  } catch (error) {
    console.error("Error on converting comments: ", error);
    return false;
  }

  try {
    await postInteractionsDocRef.update({
      commentedPostsArray: FieldValue.delete(),
    });

    return true;
  } catch (error) {
    console.error("Error on deleting array field: ", error);
    return false;
  }
}

async function convertOneUserLikes(
  postInteractionsDocRef: FirebaseFirestore.DocumentReference
) {
  try {
    await postInteractionsDocRef.update({
      likedPostsArray: FieldValue.delete(),
    });
    return true;
  } catch (error) {
    console.error("Error on converting likes: ", error);
    return false;
  }
}

async function addDocToUploadedPostsArray(
  username: string,
  uploadedPostDocData: UploadedPostArrayObject
) {
  try {
    const uploadedPostsArrayRef = `users/${username}/personal/postInteractions/uploadedPosts`;
    await firestore.collection(uploadedPostsArrayRef).add(uploadedPostDocData);
    return true;
  } catch (error) {
    console.error("Error on adding doc to uploaded posts array: ", error);
    return false;
  }
}

async function convertOneUserUploadedPosts(
  username: string,
  uploadedPostArray: PostInteractions["uploadedPostArray"],
  postInteractionsDocRef: FirebaseFirestore.DocumentReference
) {
  try {
    const results = await Promise.all(
      uploadedPostArray.map((up) => addDocToUploadedPostsArray(username, up))
    );
    if (!results) {
      console.error("Error on converting uploaded posts");
      return false;
    }
  } catch (error) {
    console.error("Error on converting uploaded posts: ", error);
    return false;
  }

  try {
    await postInteractionsDocRef.update({
      uploadedPostsArray: FieldValue.delete(),
      uploadedPostArray: FieldValue.delete(),
    });

    return true;
  } catch (error) {
    console.error("Error on deleting array fields: ", error);
    return false;
  }
}

async function convertOneUser(username: string) {
  try {
    const postInteractionsDoc = await firestore
      .doc(`users/${username}/personal/postInteractions`)
      .get();

    if (!postInteractionsDoc) {
      console.error("Post interactions doc doesn't exist for user: ", username);
      return true;
    }

    const data = postInteractionsDoc.data() as PostInteractions;

    const results = await Promise.all([
      convertOneUserComments(
        username,
        data.commentedPostsArray,
        postInteractionsDoc.ref
      ),
      convertOneUserLikes(postInteractionsDoc.ref),
      convertOneUserUploadedPosts(
        username,
        (data.uploadedPostArray || []).concat(data.uploadedPostsArray || []),
        postInteractionsDoc.ref
      ),
    ]);
    if (!results) {
      console.error("Error on converting one user");
      return false;
    }
    return true;
  } catch (error) {
    console.error("Error on converting one user: ", error);
    return false;
  }
}

async function convertAllUsers(usernames: string[]) {
  try {
    const results = await Promise.all(
      usernames.map((username) => convertOneUser(username))
    );
    if (!results) {
      console.error("Error on converting all users");
      return false;
    }
    return true;
  } catch (error) {
    console.error("Error on converting all users: ", error);
    return false;
  }
}

export const convertPostInteractions = onRequest(async (req, res) => {
  const authResult = handleAuthorization(req.headers.authorization);
  if (!authResult) {
    res.status(401).send("Unauthorized");
    return;
  }

  const usersnames = await getAllUsers();
  if (!usersnames) {
    res.status(500).send("Internal Server Error");
    return;
  }
  const result = await convertAllUsers(usersnames);
  if (!result) {
    res.status(500).send("Internal Server Error");
    return;
  }
  res.status(200).send("OK");
});
