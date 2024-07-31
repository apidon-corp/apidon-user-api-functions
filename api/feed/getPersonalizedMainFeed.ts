import {onRequest} from "firebase-functions/v2/https";
import {firestore} from "../../firebase/adminApp";
import getDisplayName from "../../helpers/getDisplayName";
import {PostsDocData} from "@/types/Post";
import {appCheckMiddleware} from "../../middleware/appCheckMiddleware";

async function handleAuthorization(key: string | undefined) {
  if (key === undefined) {
    console.error("Unauthorized attemp to sendReply API.");
    return false;
  }

  const operationFromUsername = await getDisplayName(key);
  if (!operationFromUsername) return false;

  return operationFromUsername;
}

async function getPostRecommendations() {
  try {
    const postsDocSnapshot = await firestore.doc("posts/posts").get();

    if (!postsDocSnapshot.exists) {
      console.error("Posts doc doesn't exist in firestore.");
      return false;
    }

    const postsDocData = postsDocSnapshot.data() as PostsDocData;

    if (!postsDocData) {
      console.error("Posts doc data is undefined.");
      return false;
    }

    const postDocPaths = postsDocData.postDocPaths;

    if (!postDocPaths) {
      console.error("Post doc paths is undefined.");
      return false;
    }

    const sortedPostDocPaths = postDocPaths;
    sortedPostDocPaths.sort((a, b) => b.timestamp - a.timestamp);

    return sortedPostDocPaths.map((item) => item.postDocPath);
  } catch (error) {
    console.error("Error while getting post recommendations: \n", error);
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

    const postDocPathArray = await getPostRecommendations();
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
