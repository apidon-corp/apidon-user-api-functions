import { onRequest } from "firebase-functions/v2/https";
import getDisplayName from "../../helpers/getDisplayName";
import { PostServerDataV3, UploadedPostArrayObject } from "../../types/Post";
import { bucket, firestore } from "../../firebase/adminApp";
import { FieldValue } from "firebase-admin/firestore";
import {
  CurrentProviderDocData,
  PostUploadActionRequestBody,
} from "../../types/Provider";
import { externalAPIRoutes, keys } from "../../config";

async function handleAuthorization(key: string | undefined) {
  if (key === undefined) {
    console.error("Unauthorized attemp to sendReply API.");
    return false;
  }

  const operationFromUsername = await getDisplayName(key);
  if (!operationFromUsername) return false;

  return operationFromUsername;
}

function checkProps(description: string, image: string) {
  if (!description && !image) {
    console.error("Both description and image is undefined.");
    return false;
  }
  return true;
}

function createPostServerData(description: string, username: string) {
  const ts = Date.now();

  const newPostServerData: PostServerDataV3 = {
    comments: [],
    creationTime: ts,
    description: description,
    image: "",
    rates: [],
    nftStatus: { convertedToNft: false },
    senderUsername: username,
    id: ts.toString(),
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

async function createPostOnFirestore(
  postServerData: PostServerDataV3,
  username: string
) {
  try {
    await firestore.doc(`/users/${username}/posts/${postServerData.id}`).set({
      ...postServerData,
    });
    return true;
  } catch (error) {
    console.error("Error on creating post on Firestore Database.");
    return false;
  }
}

async function updateUploadedPostArray(username: string, postDocPath: string) {
  try {
    const newUploadedPostObject: UploadedPostArrayObject = {
      postDocPath: postDocPath,
      timestamp: Date.now(),
    };

    const postInteractionsDoc = await firestore
      .doc(`users/${username}/personal/postInteractions`)
      .get();

    if (!postInteractionsDoc.exists) {
      postInteractionsDoc.ref.set({
        uploadedPostsArray: FieldValue.arrayUnion(newUploadedPostObject),
      });
    } else {
      postInteractionsDoc.ref.update({
        uploadedPostsArray: FieldValue.arrayUnion(newUploadedPostObject),
      });
    }
  } catch (error) {
    console.error("Error while updating uploadedPostArray");
    return false;
  }

  return true;
}

async function getProviderData(username: string) {
  try {
    const providerDocSnapshot = await firestore
      .doc(`/users/${username}/provider/currentProvider`)
      .get();
    if (!providerDocSnapshot.exists) {
      console.error("Provider doc doesn't exist.");
      return false;
    }
    const providerDocData =
      providerDocSnapshot.data() as CurrentProviderDocData;
    if (providerDocData === undefined) {
      console.error("Provider doc data is undefined.");
      return false;
    }

    return {
      providerId: providerDocData.providerId,
      clientId: providerDocData.clientId,
    };
  } catch (error) {
    console.error("Error while getting provider data");
    return false;
  }
}

async function sendPostForClassification(
  username: string,
  imageURL: string,
  postDocPath: string,
  providerId: string,
  clientId: string
) {
  const bodyContent: PostUploadActionRequestBody = {
    imageURL: imageURL,
    postDocPath: postDocPath,
    providerId: providerId,
    username: username,
    clientId: clientId,
  };

  try {
    const response = await fetch(
      externalAPIRoutes.provider.client.classification.postUploadActicon,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          authorization: keys.API_KEY_BETWEEN_SERVICES,
        },
        body: JSON.stringify({ ...bodyContent }),
        keepalive: true,
      }
    );
    if (!response.ok) {
      console.error(
        "Response from postUploadAction(providerside) API is not okay: \n",
        await response.text()
      );
      return false;
    }

    return true;
  } catch (error) {
    console.error("Error while sending post for classification: \n", error);
    return false;
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export const postUpload = onRequest(async (req, res) => {
  const { authorization } = req.headers;
  const { description, tempImageLocation } = req.body;

  const username = await handleAuthorization(authorization);
  if (!username) {
    res.status(401).send("Unauthorized");
    return;
  }

  const checkPropsResult = checkProps(description, tempImageLocation);
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

  const [
    createPostOnFirestoreResult,
    updateUploadedPostArrayResult,
    currentProviderData,
  ] = await Promise.all([
    createPostOnFirestore(postServerData, username),
    updateUploadedPostArray(
      username,
      `/users/${username}/posts/${postServerData.id}`
    ),
    getProviderData(username),
  ]);

  if (
    !createPostOnFirestoreResult ||
    !updateUploadedPostArrayResult ||
    !currentProviderData
  ) {
    res.status(500).send("Internal Server Error");
    return;
  }

  sendPostForClassification(
    username,
    postServerData.image,
    `/users/${username}/posts/${postServerData.id}`,
    currentProviderData.providerId,
    currentProviderData.clientId
  );

  await delay(1000);

  res.status(200).json({
    newPostData: postServerData,
    newPostDocId: postServerData.id,
  });

  return;
});
