import { firestore } from "../../../firebase/adminApp";
import getDisplayName from "../../../helpers/getDisplayName";
import { appCheckMiddleware } from "../../../middleware/appCheckMiddleware";
import { onRequest } from "firebase-functions/https";

async function handleAuthorization(key: string | undefined) {
  if (key === undefined) {
    console.error("Unauthorized attemp to sendReply API.");
    return false;
  }

  const operationFromUsername = await getDisplayName(key);
  if (!operationFromUsername) return false;

  return operationFromUsername;
}

function checkProps(unBlockedUser: string) {
  if (!unBlockedUser) {
    console.error(
      "Invalid request at block API. Reason: unBlockedUser is undefined."
    );
    return false;
  }
  return true;
}

async function deleteBlockedDocFromRequsterBlocksCollection(
  requtesterUsername: string,
  unBlockedUser: string
) {
  try {
    await firestore
      .doc(`/users/${requtesterUsername}/blocks/${unBlockedUser}`)
      .delete();
    return true;
  } catch (error) {
    console.error(
      "Error while deleting blocked doc from requster blocks collection",
      error
    );
    return false;
  }
}

export const unBlock = onRequest(
  appCheckMiddleware(async (req, res) => {
    const { authorization } = req.headers;
    const { unBlockedUser } = req.body;

    const requtesterUsername = await handleAuthorization(authorization);
    if (!requtesterUsername) {
      res.status(401).send("Unauthorized");
      return;
    }

    const checkPropsResult = checkProps(unBlockedUser);
    if (!checkPropsResult) {
      res.status(422).send("Invalid Request");
      return;
    }
    const deleteBlockedDocFromRequsterBlocksCollectionResult =
      await deleteBlockedDocFromRequsterBlocksCollection(
        requtesterUsername,
        unBlockedUser
      );
    if (!deleteBlockedDocFromRequsterBlocksCollectionResult) {
      res.status(500).send("Internal Server Error");
      return;
    }

    res.status(200).send("Success");
  })
);
