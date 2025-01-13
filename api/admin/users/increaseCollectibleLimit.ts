import {onRequest} from "firebase-functions/v2/https";
import {firestore} from "../../../firebase/adminApp";
import {handleAdminAuthorization} from "../../../helpers/handleAdminAuthorization";

function checkProps(username: string, newLimit: number) {
  if (!username) {
    return false;
  }

  if (typeof newLimit !== "number" || newLimit < 0) {
    return false;
  }

  return true;
}

async function updateUserUsageLimits(username: string, newLimit: number) {
  try {
    const usageDocRef = firestore.doc(`users/${username}/collectible/usage`);
    const usageDoc = await usageDocRef.get();

    if (!usageDoc.exists) {
      await usageDocRef.set({
        limit: newLimit,
      });
    } else {
      await usageDocRef.update({
        limit: newLimit,
      });
    }

    return true;
  } catch (error) {
    console.error("Error updating user usage limits", error);
    return false;
  }
}

export const increaseCollectibleLimit = onRequest(async (req, res) => {
  const {authorization} = req.headers;
  const {username, newLimit} = req.body;

  const authResult = handleAdminAuthorization(authorization);
  if (!authResult) {
    res.status(401).send("Unauthorized");
    return;
  }

  const checkPropsResult = checkProps(username, newLimit);
  if (!checkPropsResult) {
    res.status(422).send("Invalid Props");
    return;
  }

  const updateResult = await updateUserUsageLimits(username, newLimit);
  if (!updateResult) {
    res.status(500).send("Internal Server Error");
    return;
  }

  res.status(200).send("OK");
});
