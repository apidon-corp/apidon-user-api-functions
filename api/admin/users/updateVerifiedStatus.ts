import {onRequest} from "firebase-functions/https";

import {firestore} from "../../../firebase/adminApp";
import {handleAdminAuthorization} from "../../../helpers/handleAdminAuthorization";

function checkProps(username: string, isVerified: boolean) {
  if (!username) {
    return false;
  }

  if (typeof isVerified !== "boolean") return false;
  return true;
}

async function updateUserDoc(username: string, isVerified: boolean) {
  try {
    const userDocRef = firestore.doc(`users/${username}`);

    await userDocRef.update({
      verified: isVerified,
    });
    return true;
  } catch (error) {
    console.error("Error updating user document", error);
    return false;
  }
}

export const updateVerifiedStatus = onRequest(async (req, res) => {
  const {authorization} = req.headers;
  const {username, isVerified} = req.body;

  const authResult = await handleAdminAuthorization(authorization);
  if (!authResult) {
    res.status(401).send("Unauthorized");
    return;
  }

  const checkPropsResult = checkProps(username, isVerified);
  if (!checkPropsResult) {
    res.status(422).send("Invalid Props");
    return;
  }

  const updateResult = await updateUserDoc(username, isVerified);
  if (!updateResult) {
    res.status(500).send("Internal Server Error");
    return;
  }

  res.status(200).send("OK");
});
