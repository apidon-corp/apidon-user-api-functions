import { onRequest } from "firebase-functions/v2/https";

import { getConfigObject } from "../../../configs/getConfigObject";
import { firestore } from "../../../firebase/adminApp";
import { UserInServer } from "@/types/User";

import { auth } from "../../../firebase/adminApp";

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

  return authorization === configObject.ADMIN;
}

async function getUIDOfUser(username: string) {
  try {
    const userDoc = await firestore.doc(`users/${username}`).get();

    if (!userDoc.exists) {
      console.error("User document does not exist");
      return false;
    }

    const data = userDoc.data() as UserInServer;

    if (!data) {
      console.error("User data does not exist");
      return false;
    }

    const uid = data.uid;

    return uid;
  } catch (error) {
    console.error("Error getting user UID", error);
    return false;
  }
}

async function enableUserAuthObject(uid: string) {
  try {
    await auth.updateUser(uid, { disabled: false });
    return true;
  } catch (error) {
    console.error("Error enabling user auth object", error);
    return false;
  }
}

async function getUsersPostDocPaths(username: string) {
  try {
    const query = await firestore
      .collection("posts")
      .where("sender", "==", username)
      .get();

    return query.docs.map((doc) => doc.id);
  } catch (error) {
    console.error("Error getting user post doc paths", error);
    return false;
  }
}

async function unBanPost(postDocPath: string) {
  try {
    await firestore.doc(postDocPath).update({
      reviewStatus: "pending",
    });
    return true;
  } catch (error) {
    console.error("Error unBanning post", error);
    return false;
  }
}

async function unBanPostOfUsers(postDocPaths: string[]) {
  try {
    await Promise.all(postDocPaths.map(unBanPost));
    return true;
  } catch (error) {
    console.error("Error unBanning post of users", error);
    return false;
  }
}

export const unBanUser = onRequest(async (req, res) => {
  const { authorization } = req.headers;
  const { username } = req.body;

  const authResult = handleAuthorization(authorization);

  if (!authResult) {
    res.status(401).send("Unauthorized");
    return;
  }

  const uid = await getUIDOfUser(username);
  if (!uid) {
    res.status(500).send("Internal Server Error");
    return;
  }

  const enableResult = await enableUserAuthObject(uid);
  if (!enableResult) {
    res.status(500).send("Internal Server Error");
    return;
  }

  const postDocPaths = await getUsersPostDocPaths(username);
  if (!postDocPaths) {
    res.status(500).send("Internal Server Error");
    return;
  }

  const banPostResult = await unBanPostOfUsers(postDocPaths);
  if (!banPostResult) {
    res.status(500).send("Internal Server Error");
    return;
  }

  res.status(200).send("OK");
});
