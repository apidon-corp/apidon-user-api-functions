import { onRequest } from "firebase-functions/v2/https";

import { getConfigObject } from "../../../configs/getConfigObject";
import { firestore } from "../../../firebase/adminApp";
import { UserIdentityDoc } from "../../../types/Identity";

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

function checkProps(username: string, isVerified: boolean) {
  if (!username) {
    return false;
  }

  if (typeof isVerified !== "boolean") return false;
  return true;
}

async function checkUserCompletedKYC(username: string) {
  // As admin, we are directly changing verified status.
  return true;

  try {
    const identityDoc = await firestore
      .doc(`users/${username}/personal/identity`)
      .get();
    if (!identityDoc.exists) {
      console.error("User identity doc does not exist");
      return false;
    }
    const identityData = identityDoc.data() as UserIdentityDoc;
    if (!identityData) {
      console.error("User identity data does not exist");
      return false;
    }
    return identityData.status === "verified";
  } catch (error) {
    console.error("Error checking user KYC status", error);
    return false;
  }
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
  const { authorization } = req.headers;
  const { username, isVerified } = req.body;

  const authResult = handleAuthorization(authorization);
  if (!authResult) {
    res.status(401).send("Unauthorized");
    return;
  }

  const checkPropsResult = checkProps(username, isVerified);
  if (!checkPropsResult) {
    res.status(422).send("Invalid Props");
    return;
  }
  const checkUserCompletedKYCResult = await checkUserCompletedKYC(username);
  if (!checkUserCompletedKYCResult) {
    res.status(403).send("Forbidden");
    return;
  }

  const updateResult = await updateUserDoc(username, isVerified);
  if (!updateResult) {
    res.status(500).send("Internal Server Error");
    return;
  }

  res.status(200).send("OK");
});
