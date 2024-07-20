import {onRequest} from "firebase-functions/v2/https";
import getDisplayName from "../../helpers/getDisplayName";
import {firestore} from "../../firebase/adminApp";
import {UserInServer} from "../../types/User";

async function handleAuthorization(key: string | undefined) {
  if (key === undefined) {
    console.error("Unauthorized attemp to integrateModel API.");
    return false;
  }

  const operationFromUsername = await getDisplayName(key);
  if (!operationFromUsername) return false;

  return operationFromUsername;
}

/**
 * Create array from followers' username.
 * @param username
 * @returns
 */
async function getFollowers(username: string) {
  try {
    const followersCollectionSnapshot = await firestore
      .collection(`/users/${username}/followers`)
      .get();

    return followersCollectionSnapshot.docs.map((doc) => doc.id);
  } catch (error) {
    console.error("Error while getting followers: \n", error);
    return false;
  }
}

/**
 * Create array from following's username.
 * @param username
 * @returns
 */
async function getFollowings(username: string) {
  try {
    const followersCollectionSnapshot = await firestore
      .collection(`/users/${username}/followings`)
      .get();

    return followersCollectionSnapshot.docs.map((doc) => doc.id);
  } catch (error) {
    console.error("Error while getting followers: \n", error);
    return false;
  }
}

/**
 * Fetches data of each frens.
 * @param fren
 * @returns
 */
async function getFrenData(fren: string) {
  try {
    const frenDocSnapshot = await firestore.doc(`/users/${fren}`).get();
    if (!frenDocSnapshot.exists) {
      console.error(`Fren (${fren}) doc doesn't exist.`);
      return false;
    }

    const frenDocData = frenDocSnapshot.data() as UserInServer;
    if (frenDocData === undefined) {
      console.error(`Fren (${fren}) doc data is undefined.`);
      return false;
    }

    return {
      username: frenDocData.username,
      fullname: frenDocData.fullname,
      image: frenDocData.profilePhoto,
    };
  } catch (error) {
    console.error("Error while getting fren data: \n", error);
    return false;
  }
}

/**
 * Simply creates array from people who are on both followers and followings
 * @param followers
 * @param followings
 * @returns
 */
function createFrenOptions(followers: string[], followings: string[]) {
  const frenOptions: string[] = [];
  followers.map((follower) => {
    if (followings.includes(follower)) {
      frenOptions.push(follower);
    }
  });
  return frenOptions;
}

/**
 * After getting frens, we are fetching their fullnames and profile pictures. Then returns an array from them.
 * @param frens
 * @returns
 */
async function createFrensData(frens: string[]) {
  const frensData = await Promise.all(frens.map((fren) => getFrenData(fren)));

  const finalFrenDatas: {
    username: string;
    fullname: string;
    image: string;
  }[] = [];
  for (const data of frensData) {
    if (data === false) continue;
    finalFrenDatas.push(data);
  }

  return finalFrenDatas;
}

export const getFrenOptions = onRequest(async (req, res) => {
  const {authorization} = req.headers;

  const username = await handleAuthorization(authorization);
  if (!username) {
    res.status(401).send("Unauthorized");
    return;
  }

  const [followers, followings] = await Promise.all([
    getFollowers(username),
    getFollowings(username),
  ]);
  if (!followers || !followings) {
    res.status(500).send("Internal Server Error");
    return;
  }

  const frenOptions = createFrenOptions(followers, followings);

  const frensData = await createFrensData(frenOptions);

  res.status(200).json({
    frensData: frensData,
  });

  return;
});
