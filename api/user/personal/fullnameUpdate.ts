import { onRequest } from "firebase-functions/v2/https";
import { firestore } from "../../../firebase/adminApp";
import getDisplayName from "../../../helpers/getDisplayName";
import { appCheckMiddleware } from "../../../middleware/appCheckMiddleware";

async function handleAuthorization(key: string | undefined) {
  if (key === undefined) {
    console.error("Unauthorized attemp to sendReply API.");
    return false;
  }

  const operationFromUsername = await getDisplayName(key);
  if (!operationFromUsername) return false;

  return operationFromUsername;
}

function checkProps(fullname: string) {
  if (!fullname) {
    console.error("Image is undefined.");
    return false;
  }

  // @ts-ignore
  const fullnameRegex = /^\p{L}{1,20}(?: \p{L}{1,20})*$/u;
  const regexTestResult = fullnameRegex.test(fullname);

  return regexTestResult;
}

async function updateFirestoreUserDoc(username: string, fullname: string) {
  try {
    await firestore.doc(`/users/${username}`).update({
      fullname: fullname,
    });
    return true;
  } catch (error) {
    console.error(
      "Error while updating username. (We were updating userdoc)",
      error
    );
    return false;
  }
}

export const fullnameUpdate = onRequest(
  appCheckMiddleware(async (req, res) => {
    const { authorization } = req.headers;
    const { fullname } = req.body;

    const username = await handleAuthorization(authorization);
    if (!username) {
      res.status(401).send("Unauthorized");
      return;
    }

    const checkPropsResult = checkProps(fullname);
    if (!checkPropsResult) {
      res.status(400).send("Bad Request");
      return;
    }

    const updateUserDocResult = await updateFirestoreUserDoc(
      username,
      fullname
    );
    if (!updateUserDocResult) {
      res.status(500).send("Internal Server Error");
      return;
    }

    res.status(200).send("Fullname updated successfully.");
  })
);
