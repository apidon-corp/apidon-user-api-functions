import {onRequest} from "firebase-functions/v2/https";

import {handleAdminAuthorization} from "../../../helpers/handleAdminAuthorization";
import {auth, firestore} from "../../../firebase/adminApp";
import {NewPostDocData} from "../../../types/Post";
import {UserInServer} from "../../../types/User";

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

async function disableUserAuthObject(uid: string) {
  try {
    await auth.updateUser(uid, {disabled: true});
    return true;
  } catch (error) {
    console.error("Error disabling user auth object", error);
    return false;
  }
}

async function getUsersPostDocPaths(username: string) {
  try {
    const query = await firestore
      .collection("posts")
      .where("senderUsername", "==", username)
      .get();

    return query.docs.map((doc) => (doc.data() as NewPostDocData).postDocPath);
  } catch (error) {
    console.error("Error getting user post doc paths", error);
    return false;
  }
}

async function banPost(postDocPath: string) {
  try {
    await firestore.doc(postDocPath).update({
      reviewStatus: {
        status: "rejected",
        rejectionReason: "Ban of user.",
      },
    });
    return true;
  } catch (error) {
    console.error("Error banning post", error);
    return false;
  }
}

async function banPostOfUsers(postDocPaths: string[]) {
  try {
    await Promise.all(postDocPaths.map(banPost));
    return true;
  } catch (error) {
    console.error("Error banning post of users", error);
    return false;
  }
}

export const banUser = onRequest(async (req, res) => {
  const {authorization} = req.headers;
  const {username} = req.body;

  const authResult = handleAdminAuthorization(authorization);

  if (!authResult) {
    res.status(401).send("Unauthorized");
    return;
  }

  const uid = await getUIDOfUser(username);
  if (!uid) {
    res.status(500).send("Internal Server Error");
    return;
  }

  const disableResult = await disableUserAuthObject(uid);
  if (!disableResult) {
    res.status(500).send("Internal Server Error");
    return;
  }

  const postDocPaths = await getUsersPostDocPaths(username);
  if (!postDocPaths) {
    res.status(500).send("Internal Server Error");
    return;
  }

  const banPostResult = await banPostOfUsers(postDocPaths);
  if (!banPostResult) {
    res.status(500).send("Internal Server Error");
    return;
  }

  res.status(200).send("OK");
});
