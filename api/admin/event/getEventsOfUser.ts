import {onRequest} from "firebase-functions/https";

import {getConfigObject} from "../../../configs/getConfigObject";
import {firestore} from "../../../firebase/adminApp";
import {CollectibleDocData} from "../../../types/Collectible";
import {PostServerData} from "../../../types/Post";

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

function checkProps(username: string) {
  if (!username) {
    console.error("Username is missing");
    return false;
  }

  return true;
}

async function getEventsBasedCollectiblesPostDocPaths(username: string) {
  try {
    const query = await firestore
      .collection("collectibles")
      .where("type", "==", "event")
      .where("creator", "==", username)
      //   .orderBy("timestamp", "desc")
      .get();

    return query.docs.map(
      (doc) => (doc.data() as CollectibleDocData).postDocPath
    );
  } catch (error) {
    console.error("Error on getting events based collectible docs: ", error);
    return false;
  }
}

async function getPostDocData(postDocPath: string) {
  try {
    const postDocSnapshot = await firestore.doc(postDocPath).get();
    if (!postDocSnapshot.exists) {
      console.error("Post document does not exist");
      return false;
    }
    const postDocData = postDocSnapshot.data() as PostServerData;

    if (!postDocData) {
      console.error("Post document data is undefined");
      return false;
    }
    return postDocData;
  } catch (error) {
    console.error("Error getting post data:", error);
    return false;
  }
}

async function getAllPostDatas(postDocPaths: string[]) {
  try {
    const postDocDatas = await Promise.all(postDocPaths.map(getPostDocData));
    return postDocDatas;
  } catch (error) {
    console.error("Error getting all post datas:", error);
    return false;
  }
}

export const getEventsOfUser = onRequest(async (req, res) => {
  const {authorization} = req.headers;
  const {username} = req.body;

  if (!handleAuthorization(authorization)) {
    res.status(401).send("Unauthorized");
    return;
  }

  if (!checkProps(username)) {
    res.status(422).send("Invalid Props");
    return;
  }

  const eventBasedPostDocPaths = await getEventsBasedCollectiblesPostDocPaths(
    username
  );
  if (!eventBasedPostDocPaths) {
    res.status(500).send("Error getting event based collectible docs");
    return;
  }
  const eventBasedPostDocDatas = await getAllPostDatas(eventBasedPostDocPaths);
  if (!eventBasedPostDocDatas) {
    res.status(500).send("Error getting event based collectible datas");
    return;
  }

  const filteredEventBasedPostDocDatas: PostServerData[] = [];
  for (const postDocData of eventBasedPostDocDatas) {
    if (postDocData) {
      filteredEventBasedPostDocDatas.push(postDocData);
    }
  }

  filteredEventBasedPostDocDatas.sort(
    (a, b) => b.creationTime - a.creationTime
  );

  res.status(200).send({
    postDocDatas: filteredEventBasedPostDocDatas,
  });
});
