import {onRequest} from "firebase-functions/https";

import getDisplayName from "../../../helpers/getDisplayName";
import {firestore} from "../../../firebase/adminApp";

import {appCheckMiddleware} from "../../../middleware/appCheckMiddleware";

async function handleAuthorization(key: string | undefined) {
  if (key === undefined) {
    console.error("Unauthorized attemp to sendReply API.");
    return false;
  }

  const operationFromUsername = await getDisplayName(key);
  if (!operationFromUsername) return false;

  return operationFromUsername;
}

function checkProps(suspectUsername: string) {
  if (!suspectUsername) {
    console.error("Image is undefined.");
    return false;
  }

  return true;
}

async function getFollowers(username: string) {
  try {
    const followers = await firestore
      .collection(`/users/${username}/followers`)
      .get();
    return followers.docs.map((doc) => doc.id);
  } catch (error) {
    console.error("Error while getting followers", error);
    return [];
  }
}

async function getFollowings(username: string) {
  try {
    const followings = await firestore
      .collection(`/users/${username}/followings`)
      .get();
    return followings.docs.map((doc) => doc.id);
  } catch (error) {
    console.error("Error while getting followings", error);
    return [];
  }
}

function getFollowStatusMethod(
  suspectUsername: string,
  followers: string[],
  followings: string[]
) {
  const doesRequesterFollowsSuspect = followings.includes(suspectUsername);
  const doesSuspectFollowsRequester = followers.includes(suspectUsername);

  return {
    doesRequesterFollowsSuspect,
    doesSuspectFollowsRequester,
  };
}

export const getFollowStatus = onRequest(
  appCheckMiddleware(async (req, res) => {
    const {authorization} = req.headers;
    const {suspectUsername} = req.body;

    const username = await handleAuthorization(authorization);
    if (!username) {
      res.status(401).send("Unauthorized");
      return;
    }

    const checkPropsResult = checkProps(suspectUsername);
    if (!checkPropsResult) {
      res.status(422).send("Invalid Request");
      return;
    }

    const [followers, followings] = await Promise.all([
      getFollowers(username),
      getFollowings(username),
    ]);

    const followStatus = getFollowStatusMethod(
      suspectUsername,
      followers,
      followings
    );

    res.status(200).json({...followStatus});
    return;
  })
);
