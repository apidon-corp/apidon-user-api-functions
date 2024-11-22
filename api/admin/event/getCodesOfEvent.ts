import {firestore} from "../../../firebase/adminApp";
import {getConfigObject} from "../../../configs/getConfigObject";
import {onRequest} from "firebase-functions/https";
import {CodeDocData} from "../../../types/Collectible";

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

function checkProps(collectibleDocPath: string) {
  if (!collectibleDocPath) {
    console.error("Collectible doc path is missing");
    return false;
  }
  return true;
}

async function getCodes(collectibleDocPath: string) {
  try {
    const query = await firestore
      .collection("collectibleCodes")
      .where("collectibleDocPath", "==", collectibleDocPath)
      .get();

    return query.docs.map((doc) => doc.data() as CodeDocData);
  } catch (error) {
    console.error("Error on getting codes of event: ", error);
    return false;
  }
}

export const getCodesOfEvent = onRequest(async (req, res) => {
  const {authorization} = req.headers;
  const {collectibleDocPath} = req.body;

  if (!handleAuthorization(authorization)) {
    res.status(401).send("Unauthorized");
    return;
  }
  if (!checkProps(collectibleDocPath)) {
    res.status(422).send("Invalid Props");
    return;
  }
  const codes = await getCodes(collectibleDocPath);
  if (!codes) {
    res.status(500).send("Internal Server Error");
    return;
  }
  res.status(200).send({
    codes: codes,
  });
});
