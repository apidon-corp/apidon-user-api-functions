import {onRequest} from "firebase-functions/https";

import {handleAdminAuthorization} from "../../../helpers/handleAdminAuthorization";
import {firestore} from "../../../firebase/adminApp";
import {CollectibleDocData} from "../../../types/Collectible";
import {NewPostDocData} from "../../../types/Post";

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
    const postDocData = postDocSnapshot.data() as NewPostDocData;

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

  if (!(await handleAdminAuthorization(authorization))) {
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

  const filteredEventBasedPostDocDatas: NewPostDocData[] = [];
  for (const postDocData of eventBasedPostDocDatas) {
    if (postDocData) {
      filteredEventBasedPostDocDatas.push(postDocData);
    }
  }

  filteredEventBasedPostDocDatas.sort(
    (a, b) => b.timestamp - a.timestamp
  );

  res.status(200).send({
    postDocDatas: filteredEventBasedPostDocDatas,
  });
});
