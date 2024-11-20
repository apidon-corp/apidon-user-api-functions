import { firestore } from "../../../firebase/adminApp";
import getDisplayName from "../../../helpers/getDisplayName";
import { appCheckMiddleware } from "../../../middleware/appCheckMiddleware";
import { onRequest } from "firebase-functions/https";
import { FieldValue } from "firebase-admin/firestore";
import { ReportedByDocData } from "../../../types/User";

async function handleAuthorization(key: string | undefined) {
  if (key === undefined) {
    console.error("Unauthorized attemp to sendReply API.");
    return false;
  }

  const operationFromUsername = await getDisplayName(key);
  if (!operationFromUsername) return false;

  return operationFromUsername;
}

function checkProps(reportedUser: string) {
  if (!reportedUser) return false;
  return true;
}

async function checkAlreadyReportedByUser(
  reportedUser: string,
  requster: string
) {
  try {
    const reportDocSnapshot = await firestore
      .doc(`users/${reportedUser}/reportedBys/${requster}`)
      .get();

    return reportDocSnapshot.exists;
  } catch (error) {
    console.error("Error while checking already reported by user", error);
    return null;
  }
}

async function updateUserDocOfReportedUser(reportedUser: string) {
  try {
    const userDocRef = firestore.doc(`users/${reportedUser}`);

    await userDocRef.update({
      reportCount: FieldValue.increment(1),
    });

    return true;
  } catch (error) {
    console.error("Error while updating user doc of reported user", error);
    return false;
  }
}

async function addDocToReportedBysCollectionOfReportedUser(
  reportedUser: string,
  requster: string
) {
  const data: ReportedByDocData = {
    ts: Date.now(),
    username: requster,
  };

  try {
    const reportedBysCollectionRef = firestore.collection(
      `users/${reportedUser}/reportedBys`
    );

    await reportedBysCollectionRef.doc(requster).set(data);

    return true;
  } catch (error) {
    console.error(
      "Error while adding doc to reportedBys collection of reported user",
      error
    );
    return false;
  }
}

export const reportUser = onRequest(
  appCheckMiddleware(async (req, res) => {
    const { authorization } = req.headers;
    const { reportedUser } = req.body;

    const requester = await handleAuthorization(authorization);
    if (!requester) {
      res.status(401).send("Unauthorized");
      return;
    }

    const checkPropsResult = checkProps(reportedUser);
    if (!checkPropsResult) {
      res.status(422).send("Invalid Request");
      return;
    }

    const alreadyReportedByUserResult = await checkAlreadyReportedByUser(
      reportedUser,
      requester
    );

    if (alreadyReportedByUserResult === null) {
      res.status(500).send("Internal Server Error");
      return;
    } else if (alreadyReportedByUserResult) {
      res.status(403).send("Forbidden");
      return;
    }

    const updateUserDocOfReportedUserResult = await updateUserDocOfReportedUser(
      reportedUser
    );

    if (!updateUserDocOfReportedUserResult) {
      res.status(500).send("Internal Server Error");
      return;
    }

    const addDocToReportedBysCollectionOfReportedUserResult =
      await addDocToReportedBysCollectionOfReportedUser(
        reportedUser,
        requester
      );

    if (!addDocToReportedBysCollectionOfReportedUserResult) {
      res.status(500).send("Internal Server Error");
      return;
    }

    res.status(200).send("Success");
  })
);
