import { onRequest } from "firebase-functions/v2/https";

import { firestore } from "../../../firebase/adminApp";
import getDisplayName from "../../../helpers/getDisplayName";

async function handleAuthorization(key: string | undefined) {
  if (key === undefined) {
    console.error("Unauthorized attemp to sendReply API.");
    return false;
  }

  const operationFromUsername = await getDisplayName(key);
  if (!operationFromUsername) return false;

  return operationFromUsername;
}

function checkProps(image: string) {
  if (!image) {
    console.error("Image is undefined.");
    return false;
  }

  return true;
}

async function updateUserDoc(imageURL: string, username: string) {
  try {
    await firestore.doc(`/users/${username}`).update({
      profilePhoto: imageURL,
    });
    return true;
  } catch (error) {
    console.error("Error while updating user doc", error);
    return false;
  }
}

export const updateProfileImage = onRequest(async (req, res) => {
  const { authorization } = req.headers;
  const { image: imageURL } = req.body;

  const username = await handleAuthorization(authorization);
  if (!username) {
    res.status(401).send("Unauthorized");
    return;
  }

  const checkPropsResult = checkProps(imageURL);
  if (!checkPropsResult) {
    res.status(422).send("Invalid Request");
    return;
  }

  const updateUserDocResult = await updateUserDoc(imageURL, username);
  if (!updateUserDocResult) {
    res.status(500).send("Internal Server Error");
    return;
  }

  res.status(200).send("OK");
});
