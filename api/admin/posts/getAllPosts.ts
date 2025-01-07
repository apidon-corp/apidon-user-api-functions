import {onRequest} from "firebase-functions/v2/https";

import {firestore} from "../../../firebase/adminApp";

import {PostReviewData} from "../../../types/Admin";
import {NewPostDocData} from "../../../types/Post";

import * as express from "express";
import {handleAdminAuthorization} from "../../../helpers/handleAdminAuthorization";

async function getAllPostDatas() {
  try {
    const postDocsQuery = await firestore
      .collection("posts")
      .orderBy("timestamp", "desc")
      .get();

    return postDocsQuery.docs.map((doc) => doc.data() as NewPostDocData);
  } catch (error) {
    console.error("Error getting all post datas:", error);
    return false;
  }
}

function createPostReviewDatas(postDocDatas: NewPostDocData[]) {
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

  const {authorization} = req.headers;

  const authResult = handleAdminAuthorization(authorization);
  if (!authResult) {
    res.status(401).send("Unauthorized");
    return;
  }

  const allPostDocDatas = await getAllPostDatas();
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
