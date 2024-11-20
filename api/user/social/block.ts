import {firestore} from "../../../firebase/adminApp";
import getDisplayName from "../../../helpers/getDisplayName";
import {appCheckMiddleware} from "../../../middleware/appCheckMiddleware";
import {onRequest} from "firebase-functions/https";
import {BlockDocData} from "../../../types/User";

async function handleAuthorization(key: string | undefined) {
  if (key === undefined) {
    console.error("Unauthorized attemp to sendReply API.");
    return false;
  }

  const operationFromUsername = await getDisplayName(key);
  if (!operationFromUsername) return false;

  return operationFromUsername;
}

function checkProps(blockedUser: string) {
  if (!blockedUser) {
    console.error(
      "Invalid request at block API. Reason: blockedUser is undefined."
    );
    return false;
  }
  return true;
}

async function addBlockedUserDocToBlocksCollectionOfRequster(
  requester: string,
  blockedUser: string
) {
  const data: BlockDocData = {
    ts: Date.now(),
    blockedUserUsername: blockedUser,
  };

  try {
    await firestore.doc(`/users/${requester}/blocks/${blockedUser}`).set(data);
    return true;
  } catch (error) {
    console.error(
      "Error while adding blocked user doc to blocks collection of requester",
      error
    );
    return false;
  }
}

export const block = onRequest(
  appCheckMiddleware(async (req, res) => {
    const {authorization} = req.headers;
    const {blockedUser} = req.body;

    const requtesterUsername = await handleAuthorization(authorization);
    if (!requtesterUsername) {
      res.status(401).send("Unauthorized");
      return;
    }

    const checkPropsResult = checkProps(blockedUser);
    if (!checkPropsResult) {
      res.status(422).send("Invalid Request");
      return;
    }
    const addBlockedUserDocToBlocksCollectionOfRequsterResult =
      await addBlockedUserDocToBlocksCollectionOfRequster(
        requtesterUsername,
        blockedUser
      );

    if (!addBlockedUserDocToBlocksCollectionOfRequsterResult) {
      res.status(500).send("Internal Server Error");
      return;
    }
    res.status(200).send("Success");
  })
);
