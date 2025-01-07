import { onRequest } from "firebase-functions/v2/https";
import { bucket, firestore } from "../../firebase/adminApp";
import getDisplayName from "../../helpers/getDisplayName";
import { NewPostDocData } from "../../types/Post";

import { appCheckMiddleware } from "../../middleware/appCheckMiddleware";

import vision from "@google-cloud/vision";

const client = new vision.ImageAnnotatorClient();

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

function createPostServerData(description: string, username: string) {
  const ts = Date.now();

  const newPostServerData: NewPostDocData = {
    timestamp: ts,
    description: description,
    commentCount: 0,
    image: "",
    ratingCount: 0,
    ratingSum: 0,
    collectibleStatus: { isCollectible: false },
    senderUsername: username,
    reviewStatus: "pending",
    id: "",
    postDocPath: "",
    reportCount: 0,
  };

  return newPostServerData;
}

async function deleteTempFiles(username: string) {
  if (username.length === 0) return true;

  try {
    await bucket.deleteFiles({
      prefix: `users/${username}/postFiles/temp/`,
    });

    return true;
  } catch (error) {
    console.error("Error while deleting temp files: \n", error);
    return false;
  }
}

async function changeLocationOfTempImage(
  username: string,
  tempImageLocation: string
) {
  const postDocId = Date.now().toString();

  try {
    const tempFile = bucket.file(tempImageLocation);
    await tempFile.move(`users/${username}/postFiles/${postDocId}/image`);

    const newFile = bucket.file(
      `users/${username}/postFiles/${postDocId}/image`
    );
    await newFile.makePublic();
    const postImagePublicURL = newFile.publicUrl();

    // Can be continued even this function returns false.
    await deleteTempFiles(username);

    return {
      postDocId: postDocId,
      postImagePublicURL: postImagePublicURL,
    };
  } catch (error) {
    console.error("Error on using temp image on Firebase Storage: \n", error);
    return false;
  }
}

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

async function createPostOnFirestore(postServerData: NewPostDocData) {
  try {
    const createdPostDoc = await firestore
      .collection("posts")
      .add(postServerData);

    await createdPostDoc.update({
      id: createdPostDoc.id,
      postDocPath:
        createdPostDoc.path[0] === "/"
          ? createdPostDoc.path.slice(1)
          : createdPostDoc.path,
    });

    return true;
  } catch (error) {
    console.error("Error on creating post on Firestore Database.");
    return false;
  }
}

export const postUpload = onRequest(
  appCheckMiddleware(async (req, res) => {
    const { authorization } = req.headers;
    const { description, tempImageLocation } = req.body;

    const username = await handleAuthorization(authorization);
    if (!username) {
      res.status(401).send("Unauthorized");
      return;
    }

    const checkPropsResult = checkProps(tempImageLocation);
    if (!checkPropsResult) {
      res.status(422).send("Invalid Request");
      return;
    }

    let postServerData = createPostServerData(description, username);

    if (tempImageLocation) {
      const imageUploadResult = await changeLocationOfTempImage(
        username,
        tempImageLocation
      );
      if (!imageUploadResult) {
        res.status(500).send("Internal Server Error");
        return;
      }

      postServerData = {
        ...postServerData,
        id: imageUploadResult.postDocId,
        image: imageUploadResult.postImagePublicURL,
      };
    }

    const imageClearResult = await checkIfImageIsClear(postServerData.image);
    if (!imageClearResult) {
      res.status(403).send("Forbidden.");
      return;
    }

    const createPostOnFirestoreResult = await createPostOnFirestore(
      postServerData
    );
    if (!createPostOnFirestoreResult) {
      res.status(500).send("Internal Server Error");
      return;
    }

    res.status(200).json({
      newPostData: postServerData,
      newPostDocId: postServerData.id,
    });

    return;
  })
);
