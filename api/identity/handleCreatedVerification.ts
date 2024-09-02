import {onRequest} from "firebase-functions/v2/https";
import {firestore} from "../../firebase/adminApp";
import {UserIdentityDoc} from "../../types/Identity";
import {getConfigObject} from "../../configs/getConfigObject";

const configObject = getConfigObject();

if (!configObject) {
  throw new Error("Config object is undefined");
}

function handleAuthorization(key: string | undefined) {
  if (key === undefined) {
    console.error("Unauthorized attemp to handleCreatedVerification API.");
    return false;
  }

  if (!configObject) {
    console.error("Config object is undefined");
    return false;
  }

  return key === configObject.HANDLE_CREATED_VERIFICATION_API_KEY;
}

function checkProps(
  username: string,
  id: string,
  created: number,
  status: string
) {
  if (!username || !id || !created || !status) {
    return false;
  }
  return true;
}

async function updateUserIdentitynDoc(
  username: string,
  id: string,
  created: number,
  status: UserIdentityDoc["status"],
  livemode: boolean
) {
  if (status === "verified") {
    console.error("User identity is already verified.");
    return false;
  }

  const identityDocRef = firestore.doc(`users/${username}/personal/identity`);

  const data: UserIdentityDoc = {
    id,
    created,
    status,
    livemode,
  };

  try {
    await identityDocRef.set(data);

    return true;
  } catch (error) {
    console.error("Error on updating identity doc.");
    return false;
  }
}

export const handleCreatedVerification = onRequest(async (req, res) => {
  const {authorization} = req.headers;

  const {username, id, created, status, livemode} = req.body;

  const authResult = handleAuthorization(authorization);
  if (!authResult) {
    res.status(401).send("Unauthorized");
    return;
  }

  if (!checkProps(username, id, created, status)) {
    res.status(422).send("Invalid Request");
    return;
  }

  const updateUserIdentitynDocResult = await updateUserIdentitynDoc(
    username,
    id,
    created,
    status,
    livemode
  );
  if (!updateUserIdentitynDocResult) {
    res.status(500).send("Internal Server Error");
    return;
  }

  res.status(200).send("OK");
  return;
});
