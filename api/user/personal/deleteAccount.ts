import {DecodedIdToken} from "firebase-admin/auth";
import {auth, firestore} from "../../../firebase/adminApp";
import {appCheckMiddleware} from "../../../middleware/appCheckMiddleware";
import {onRequest} from "firebase-functions/https";

async function checkAccountDisabled(uid: string) {
  try {
    const userRecord = await auth.getUser(uid);
    return userRecord.disabled;
  } catch (error) {
    console.error("Error checking account status.", error);
    return true;
  }
}

async function handleAuthorization(authorization: string) {
  if (!authorization.startsWith("Bearer ")) {
    console.error("Authorization header is not in the correct format.");
    return "";
  }

  const idToken = authorization.split("Bearer ")[1];
  let decodedToken: DecodedIdToken;

  try {
    decodedToken = await auth.verifyIdToken(idToken);
  } catch (error) {
    console.error("Error verifying token.", error);
    return "";
  }

  const username = decodedToken.name as string;

  if (!username) {
    console.error("User has no display name.");
    return "";
  }

  const disabled = await checkAccountDisabled(decodedToken.uid);
  if (disabled) {
    console.error("User account is disabled: ", username);
    return "";
  }

  return {
    username: username,
    uid: decodedToken.uid,
  };
}

async function updateUserDoc(username: string, rollback?: boolean) {
  try {
    const userDocRef = firestore.doc(`users/${username}`);

    await userDocRef.update({
      isScheduledToDelete: rollback ? false : true,
    });

    return true;
  } catch (error) {
    console.error("Error while updating user doc", error);
    return false;
  }
}

async function deleteAuthObject(uid: string) {
  try {
    await auth.deleteUser(uid);
    return true;
  } catch (error) {
    console.error("Error while deleting auth object", error);
    return false;
  }
}

export const deleteAccount = onRequest(
  appCheckMiddleware(async (req, res) => {
    const {authorization} = req.headers;

    const authResult = await handleAuthorization(authorization || "");
    if (!authResult) {
      res.status(401).send("Unauthorized");
      return;
    }

    const {uid, username} = authResult;

    const updateUserDocResult = await updateUserDoc(username);
    if (!updateUserDocResult) {
      res.status(500).send("Internal Server Error");
      return;
    }

    const deleteAuthObjectResult = await deleteAuthObject(uid);
    if (!deleteAuthObjectResult) {
      await updateUserDoc(username, true);
      res.status(500).send("Internal Server Error");
      return;
    }

    res.status(200).send("OK");
  })
);
