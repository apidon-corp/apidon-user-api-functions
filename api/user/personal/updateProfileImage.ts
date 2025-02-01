import {onRequest} from "firebase-functions/https";

import {firestore} from "../../../firebase/adminApp";
import getDisplayName from "../../../helpers/getDisplayName";
import {appCheckMiddleware} from "../../../middleware/appCheckMiddleware";

async function handleAuthorization(key: string | undefined) {
  if (key === undefined) {
    console.error("Unauthorized attemp to sendReply API.");
    return false;
  }

  const operationFromUsername = await getDisplayName(key);
  if (!operationFromUsername) return false;

  return operationFromUsername;
}

function checkProps(image: string) {
  if (!image) {
    console.error("Image is undefined.");
    return false;
  }

  return true;
}

import vision from "@google-cloud/vision";

const client = new vision.ImageAnnotatorClient();

/**
 * Check image for explicit content.
 * @param imageURL
 * @returns True for images that doesn't have explicit content.
 */
async function checkIfImageIsClear(imageURL: string) {
  try {
    const [result] = await client.safeSearchDetection(imageURL);
    const detections = result.safeSearchAnnotation;

    if (!detections) {
      console.error("Error while checking image for explicit content.");
      return false;
    }

    const badResults = ["UNKNOWN", "LIKELY", "VERY_LIKELY"];

    if (
      !detections.adult ||
      !detections.medical ||
      !detections.racy ||
      !detections.spoof ||
      !detections.violence
    ) {
      console.error("Error while checking image for explicit content.");
      return false;
    }

    let isClear = true;

    if (badResults.includes(detections.adult as string)) {
      isClear = false;
    }
    if (badResults.includes(detections.medical as string)) {
      isClear = false;
    }
    if (badResults.includes(detections.racy as string)) {
      isClear = false;
    }
    if (badResults.includes(detections.spoof as string)) {
      isClear = false;
    }
    if (badResults.includes(detections.violence as string)) {
      isClear = false;
    }

    return isClear;
  } catch (error) {
    console.error("Error while checking image for explicit content.", error);
    return false;
  }
}

async function updateUserDoc(imageURL: string, username: string) {
  try {
    await firestore.doc(`/users/${username}`).update({
      profilePhoto: imageURL,
    });
    return true;
  } catch (error) {
    console.error("Error while updating user doc", error);
    return false;
  }
}

export const updateProfileImage = onRequest(
  appCheckMiddleware(async (req, res) => {
    const {authorization} = req.headers;
    const {image: imageURL} = req.body;

    const username = await handleAuthorization(authorization);
    if (!username) {
      res.status(401).send("Unauthorized");
      return;
    }

    const checkPropsResult = checkProps(imageURL);
    if (!checkPropsResult) {
      res.status(422).send("Invalid Request");
      return;
    }

    const imageClearResult = await checkIfImageIsClear(imageURL);
    if (!imageClearResult) {
      res.status(403).send("Forbidden.");
      return;
    }

    const updateUserDocResult = await updateUserDoc(imageURL, username);
    if (!updateUserDocResult) {
      res.status(500).send("Internal Server Error");
      return;
    }

    res.status(200).send("OK");
  })
);
