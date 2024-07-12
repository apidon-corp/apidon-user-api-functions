import { onRequest } from "firebase-functions/v2/https";
import { auth, firestore } from "../../../../firebase/adminApp";
import { UserInServer } from "../../../../types/User";

import * as express from "express";

import { appCheckMiddleware } from "../../../../middleware/appCheckMiddleware";

function checkProps(eu: string) {
  if (!eu) {
    console.error("Email-Username is undefined.");
    return false;
  }
  return true;
}

function checkTypeOfEu(eu: string) {
  const emailRegex =
    /^[A-Za-z0-9._%+-]+@(gmail|yahoo|outlook|aol|icloud|protonmail|yandex|mail|zoho)\.(com|net|org)$/i;
  const emailRegexTestResult = emailRegex.test(eu);

  const usernameRegex = /^[a-z0-9]{4,20}$/;
  const usernameRegexTestResult = usernameRegex.test(eu);

  if (!emailRegexTestResult && !usernameRegexTestResult) {
    console.error("Both email and username regex's are failed.");
    return false;
  }

  if (emailRegexTestResult && usernameRegexTestResult) {
    console.error("Both email and username regex's are succeed.");
    return false;
  }

  if (emailRegexTestResult) return "email";
  else return "username";
}

async function usernameHandle(
  usernameRequested: string,
  res: express.Response
) {
  try {
    const userDocSnapshot = await firestore
      .doc(`/users/${usernameRequested}`)
      .get();
    if (!userDocSnapshot.exists) {
      console.warn("No user in database with given username.");

      res.status(200).json({
        username: "",
        email: "",
      });

      return;
    }

    const userDocData = userDocSnapshot.data() as UserInServer;

    if (userDocData === undefined) {
      console.error(
        "User's doc data is undefined even if it has a doc with its username"
      );
      res.status(500).send("Internal Server Error");
      return;
    }

    const username = userDocData.username;
    const email = userDocData.email;

    if (username === undefined) {
      console.error(
        "Username (displayname) is undefined even if there is an account."
      );
      res.status(500).send("Internal Server Error");
      return;
    }
    if (email === undefined) {
      console.error("Email is undefined even if there is an account.");
      res.status(500).send("Internal Server Error");
      return;
    }

    res.status(200).json({
      username: username,
      email: email,
    });
    return;
  } catch (error) {
    console.error(`${error}`);
    res.status(500).send("Internal Server Error");
    return;
  }
}

async function emailHandle(emailReqeuested: string, res: express.Response) {
  let username;
  let email;
  try {
    const userCredentials = await auth.getUserByEmail(emailReqeuested);
    username = userCredentials.displayName;
    email = userCredentials.email;
  } catch (error) {
    console.warn("Error while getting user credentials with email: \n", error);
    res.status(422).send("No account with found with this email.");
    return;
  }

  if (username === undefined) {
    console.error(
      "Username (displayname) is undefined even if there is an account."
    );
    res.status(500).send("Internal Server Error");
    return;
  }
  if (email === undefined) {
    console.error("Email is undefined even if there is an account.");
    res.status(500).send("Internal Server Error");
    return;
  }

  res.status(200).json({
    username: username,
    email: email,
  });
  return;
}

export const checkThereIsLinkedAccount = onRequest(
  appCheckMiddleware(async (req, res) => {
    const { eu } = req.body;

    const checkPropsResult = checkProps(eu);
    if (!checkPropsResult) {
      res.status(422).send("Invalid Props.");
      return;
    }

    const checkTypeOfEuResult = checkTypeOfEu(eu);
    if (!checkTypeOfEuResult) {
      res.status(422).send("Invalid Request");
      return;
    }

    if (checkTypeOfEuResult === "username") {
      await usernameHandle(eu, res);
      return;
    }

    if (checkTypeOfEuResult === "email") {
      await emailHandle(eu, res);
      return;
    }

    // Normally below code shouldn't work. We should have covered all catches then added return statements. But I couldn't find what is missing.
    res.status(500).send("Internal Server Error");
  })
);
