import {onRequest} from "firebase-functions/v2/https";

import {getConfigObject} from "../../../configs/getConfigObject";
import {firestore} from "../../../firebase/adminApp";

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

async function getAllCollectiblePaths() {
  try {
    const query = await firestore.collection("collectibles").get();

    return query.docs.map((doc) => doc.ref.path);
  } catch (error) {
    console.error("Error on getting all collectible paths: ", error);
    return false;
  }
}

async function updateOneCollectibleDoc(docPath: string) {
  try {
    await firestore.doc(docPath).update({
      type: "trade",
    });
    return true;
  } catch (error) {
    console.error("Error on updating one collectible doc: ", error);
    return false;
  }
}

async function updateAllCollectibleDocs(paths: string[]) {
  try {
    const results = await Promise.all(
      paths.map((p) => updateOneCollectibleDoc(p))
    );

    if (results.some((r) => !r)) {
      console.error("Error on updating some collectible docs");
    }

    return true;
  } catch (error) {
    console.error("Error on updating all collectible docs: ", error);
    return false;
  }
}

export const addCollectibleType = onRequest(async (req, res) => {
  const {authorization} = req.headers;

  const authResult = handleAuthorization(authorization);
  if (!authResult) {
    res.status(401).send("Unauthorized");
    return;
  }

  const collectiblePaths = await getAllCollectiblePaths();

  if (!collectiblePaths) {
    res.status(500).send("Internal Server Error");
    return;
  }

  const updateResult = await updateAllCollectibleDocs(collectiblePaths);
  if (!updateResult) {
    res.status(500).send("Internal Server Error");
    return;
  }

  res.status(200).send("OK");
});
