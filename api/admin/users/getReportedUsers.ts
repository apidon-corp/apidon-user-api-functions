import { onRequest } from "firebase-functions/v2/https";
import { firestore } from "../../../firebase/adminApp";
import * as express from "express";
import { handleAdminAuthorization } from "../../../helpers/handleAdminAuthorization";

interface UserDocData {
  username: string;
  reportCount: number;
}

interface ReportedUserData {
  username: string;
  reportCount: number;
}

async function getAllReportedUsers() {
  try {
    const userDocsQuery = await firestore
      .collection("users")
      .where("reportCount", ">", 0)
      .orderBy("reportCount", "desc")
      .get();
    
    return userDocsQuery.docs.map((doc) => ({
      ...doc.data(),
      username: doc.id,
    }) as UserDocData);
  } catch (error) {
    console.error("Error getting reported users:", error);
    return false;
  }
}

function createReportedUserDatas(userDocDatas: UserDocData[]) {
  const reportedUserDatas: ReportedUserData[] = [];
  
  for (const userDocData of userDocDatas) {
    const reportedUserData: ReportedUserData = {
      username: userDocData.username,
      reportCount: userDocData.reportCount
    };
    reportedUserDatas.push(reportedUserData);
  }
  
  return reportedUserDatas;
}


function setCorsHeaders(res: express.Response) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type,authorization");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
}

export const getReportedUsers = onRequest(async (req, res) => {
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

  const allUserDocDatas = await getAllReportedUsers();
  if (!allUserDocDatas) {
    res.status(500).send("Error getting reported users");
    return;
  }

  const reportedUserDatas = createReportedUserDatas(allUserDocDatas);
  const ts = Date.now();

  res.status(200).send({
    timestamp: ts,
    reportedUserDatas: reportedUserDatas,
  });
  return;
});