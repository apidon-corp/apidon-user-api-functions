import { onRequest } from "firebase-functions/https";
import { firestore } from "../../../firebase/adminApp";

import { PostReviewData } from "../../../types/Admin"; 
import * as express from "express";
import { handleAdminAuthorization } from "../../../helpers/handleAdminAuthorization";


async function getAllReportedPostDatas() {
  try {
    const reportedPostsQuery = await firestore
      .collectionGroup("postReports")
      .orderBy("timestamp", "desc")
      .get();

    
    return reportedPostsQuery.docs.map(
      (doc) => doc.data() as PostReviewData
    );
  } catch (error) {
    console.error("Error getting all reported post datas:", error);
    return false;
  }
}

function setCorsHeaders(res: express.Response) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type,authorization");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
}

export const getAllReportedPosts = onRequest(async (req, res) => {
  setCorsHeaders(res);
  
  if (req.method === "OPTIONS") {
    res.status(200).end();
    return;
  }

  const { authorization } = req.headers;
  const authResult = await handleAdminAuthorization(authorization);
  if (!authResult) {
    res.status(401).send("Unauthorized");
    return;
  }

  const allReportedPostDatas = await getAllReportedPostDatas();
  if (!allReportedPostDatas) {
    res.status(500).send("Error getting all reported post datas");
    return;
  }

  const ts = Date.now();
  res.status(200).send({
    timestamp: ts,
    reportedPostDatas: allReportedPostDatas,
  });
});
