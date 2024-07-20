import {onRequest} from "firebase-functions/v2/https";
import {firestore} from "../../../../firebase/adminApp";
import * as express from "express";
import {appCheckMiddleware} from "../../../../middleware/appCheckMiddleware";

function checkProps(referralCode: string) {
  if (!referralCode) {
    console.error("Referral code is undefined.");
    return false;
  }
  return true;
}

async function checkRefferal(referralCode: string, res: express.Response) {
  try {
    const referralCodeDocSnapshot = await firestore
      .doc(`/references/${referralCode}`)
      .get();
    if (!referralCodeDocSnapshot.exists) {
      return res.status(422).send("Referral code is invalid.");
    }

    const data = referralCodeDocSnapshot.data();

    if (data === undefined) {
      console.error("Refferal code exists but its data is undefined.");
      return res.status(500).send("Internal server error");
    }

    const inProcess = data.inProcess;
    const isUsed = data.isUsed;

    if (isUsed || inProcess) {
      return res.status(422).send("Referral code has already been used.");
    }

    return res.status(200).send("Success");
  } catch (error) {
    console.error("Error on checking referral code: \n", error);
    return res.status(422).send("Referral code is invalid.");
  }
}

export const checkReferralCode = onRequest(
  appCheckMiddleware(async (req, res) => {
    const {referralCode} = req.body;

    if (req.method !== "POST") {
      res.status(405).send("Method not allowed!");
      return;
    }

    const checkPropsResult = checkProps(referralCode);
    if (!checkPropsResult) {
      res.status(422).send("Invalid Request");
      return;
    }

    await checkRefferal(referralCode, res);
    return;
  })
);
