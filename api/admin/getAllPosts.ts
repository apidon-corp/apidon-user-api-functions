import { onRequest } from "firebase-functions/v2/https";

import { keys } from "../../config";
import { firestore } from "../../firebase/adminApp";

import { PostsDocData, PostServerData } from "../../types/Post";
import { PostReviewData } from "../../types/Admin";

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

  return authorization === keys.ADMIN.GET_ALL_POSTS_API_KEY;
}

async function getPostDocPaths() {
  try {
    const postsDocSnapshot = await firestore.doc(`/posts/posts`).get();

    if (!postsDocSnapshot.exists) {
      console.error("Posts document does not exist");
      return false;
    }

    const postsDocData = postsDocSnapshot.data() as PostsDocData;

    if (!postsDocData) {
      console.error("Posts document data is undefined");
      return false;
    }

    const postDocPathArrayItems = postsDocData.postDocPaths;

    return postDocPathArrayItems.map((p) => p.postDocPath);
  } catch (error) {
    console.error("Error getting post doc paths:", error);
    return false;
  }
}

async function getPostData(postDocPath: string) {
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
    const allPostDocDatas = await Promise.all(
      postDocPaths.map((postDocPath) => getPostData(postDocPath))
    );

    const filtered = allPostDocDatas.filter(
      (postDocData) => postDocData !== false
    ) as PostServerData[];

    return filtered;
  } catch (error) {
    console.error("Error getting all post datas:", error);
    return false;
  }
}

function createPostReviewDatas(postDocDatas: PostServerData[]) {
  const postReviewDatas: PostReviewData[] = [];

  for (const postDocData of postDocDatas) {
    const postPreviewData: PostReviewData = {
      id: postDocData.id,
      description: postDocData.description,
      image: postDocData.image,
      reviewStatus: postDocData.reviewStatus || "pending",
      senderUsername: postDocData.senderUsername,
    };

    postReviewDatas.push(postPreviewData);
  }

  return postReviewDatas;
}

export const getAllPosts = onRequest(async (req, res) => {
  const { authorization } = req.headers;

  const authResult = handleAuthorization(authorization);
  if (!authResult) {
    res.status(401).send("Unauthorized");
    return;
  }

  const postDocPaths = await getPostDocPaths();
  if (!postDocPaths) {
    res.status(500).send("Error getting post doc paths");
    return;
  }

  const allPostDocDatas = await getAllPostDatas(postDocPaths);
  if (!allPostDocDatas) {
    res.status(500).send("Error getting all post datas");
    return;
  }

  const postReviewDatas = createPostReviewDatas(allPostDocDatas);

  const ts = Date.now();

  res.status(200).send({
    timestamp: ts,
    postReviewDatas: postReviewDatas,
  });

  return;
});
