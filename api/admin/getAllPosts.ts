import { onRequest } from "firebase-functions/v2/https";

import { firestore } from "../../firebase/adminApp";

import {
  PostDataOnMainPostsCollection,
  PostServerData,
} from "../../types/Post";
import { PostReviewData } from "../../types/Admin";

import * as express from "express";
import { getConfigObject } from "../../configs/getConfigObject";

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

  return authorization === configObject.GET_ALL_POSTS_API_KEY;
}

async function getPostDocPaths() {
  try {
    const postsDocCollection = await firestore.collection("posts").get();

    return postsDocCollection.docs.map(
      (d) => (d.data() as PostDataOnMainPostsCollection).postDocPath
    );
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

/**
 * Handling CORS.
 * @param res
 */
function setCorsHeaders(res: express.Response) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type,authorization");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
}

export const getAllPosts = onRequest(async (req, res) => {
  setCorsHeaders(res);
  if (req.method === "OPTIONS") {
    res.status(200).end();
    return;
  }

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
