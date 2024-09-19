import {onRequest} from "firebase-functions/v2/https";
import {firestore} from "../../firebase/adminApp";
import getDisplayName from "../../helpers/getDisplayName";
import {appCheckMiddleware} from "../../middleware/appCheckMiddleware";
import {PostDataOnMainPostsCollection} from "../../types/Post";

async function handleAuthorization(key: string | undefined) {
  if (key === undefined) {
    console.error("Unauthorized attemp to sendReply API.");
    return false;
  }

  const operationFromUsername = await getDisplayName(key);
  if (!operationFromUsername) return false;

  return operationFromUsername;
}

async function getPostDocPaths() {
  try {
    const postsDocCollection = await firestore
      .collection("posts")
      .orderBy("timestamp", "desc")
      .get();

    return postsDocCollection.docs.map(
      (d) => (d.data() as PostDataOnMainPostsCollection).postDocPath
    );
  } catch (error) {
    console.error("Error getting post doc paths:", error);
    return false;
  }
}

export const getPersonalizedFeed = onRequest(
  appCheckMiddleware(async (req, res) => {
    const {authorization} = req.headers;

    const username = await handleAuthorization(authorization);
    if (!username) {
      res.status(401).send("Unauthorized");
      return;
    }

    const postDocPathArray = await getPostDocPaths();
    if (!postDocPathArray) {
      res.status(500).send("Internal Server Error");
      return;
    }

    res.status(200).json({
      postDocPathArray: postDocPathArray,
    });
    return;
  })
);
