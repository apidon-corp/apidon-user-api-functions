import {firestore} from "../../firebase/adminApp";
import getDisplayName from "../../helpers/getDisplayName";
import {appCheckMiddleware} from "../../middleware/appCheckMiddleware";
import {onRequest} from "firebase-functions/https";
import {ReportDocData} from "../../types/Post";
import {FieldValue} from "firebase-admin/firestore";

async function handleAuthorization(key: string | undefined) {
  if (key === undefined) {
    console.error("Unauthorized attemp to sendReply API.");
    return false;
  }

  const operationFromUsername = await getDisplayName(key);
  if (!operationFromUsername) return false;

  return operationFromUsername;
}

function checkProps(postDocPath: string) {
  if (!postDocPath) {
    console.error("Missing postDocPath");
    return false;
  }
  return true;
}

async function addReportDocToPostReportsCollection(
  postDocPath: string,
  username: string
) {
  try {
    const reportsCollectionOfPostRef = firestore
      .doc(postDocPath)
      .collection("reports");

    const data: ReportDocData = {
      username: username,
      ts: Date.now(),
    };

    await reportsCollectionOfPostRef.doc(username).set(data);

    return true;
  } catch (error) {
    console.error(
      "Error while adding report doc to post reports collection: ",
      error
    );
    return false;
  }
}

async function updateReportCountOnPostDoc(postDocPath: string) {
  try {
    const postDoc = firestore.doc(postDocPath);

    await postDoc.update({
      reportCount: FieldValue.increment(1),
    });

    return true;
  } catch (error) {
    console.error("Error while increasing report count of post.", error);
    return false;
  }
}

export const postReport = onRequest(
  appCheckMiddleware(async (req, res) => {
    const {authorization} = req.headers;
    const {postDocPath} = req.body;

    const username = await handleAuthorization(authorization);
    if (!username) {
      res.status(401).send("Unauthorized");
      return;
    }

    const checkPropsResult = checkProps(postDocPath);
    if (!checkPropsResult) {
      res.status(422).send("Invalid Request");
      return;
    }

    const addReportDocToPostReportsCollectionResult =
      await addReportDocToPostReportsCollection(postDocPath, username);
    if (!addReportDocToPostReportsCollectionResult) {
      res.status(500).send("Internal Server Error");
      return;
    }

    const increaseReportCountOfPostAtGeneralPostsCollectionResult =
      await updateReportCountOnPostDoc(postDocPath);
    if (!increaseReportCountOfPostAtGeneralPostsCollectionResult) {
      res.status(500).send("Internal Server Error");
      return;
    }

    res.status(200).send("Success");
  })
);
