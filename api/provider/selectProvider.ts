import { onRequest } from "firebase-functions/v2/https";
import getDisplayName from "../../helpers/getDisplayName";
import { firestore } from "../../firebase/adminApp";
import {
  CurrentProviderDocData,
  InteractedPostObject,
  OldProviderDocData,
} from "../../types/Provider";
import { externalAPIRoutes, keys } from "../../config";

async function handleAuthorization(key: string | undefined) {
  if (key === undefined) {
    console.error("Unauthorized attemp to sendReply API.");
    return false;
  }

  const username = await getDisplayName(key);
  if (!username) return false;

  return username;
}

async function checkProps(providerId: string) {
  if (!providerId) return false;
  return true;
}

async function getActiveProviderDocFromUserSide(username: string) {
  try {
    const currentProviderDocSnapshot = await firestore
      .doc(`/users/${username}/provider/currentProvider`)
      .get();

    if (!currentProviderDocSnapshot.exists) {
      // It is a normal situation so we don't throw any error.
      return false;
    }

    const currentProviderDocData =
      currentProviderDocSnapshot.data() as CurrentProviderDocData;

    return currentProviderDocData;
  } catch (error) {
    console.error("Error while getting active provider doc: ", error);
    return false;
  }
}

function checkChoosingSameProvider(
  requestedProviderId: string,
  existingProviderId: string
) {
  if (requestedProviderId === existingProviderId)
    console.error("Change to same provider request.");
  return requestedProviderId === existingProviderId;
}

async function createOldProviderDocForUser(
  currentProviderDocData: CurrentProviderDocData | false,
  username: string
) {
  if (!currentProviderDocData) return true;

  const oldProviderDocPath = `users/${username}/provider/old-${currentProviderDocData.providerId}-${currentProviderDocData.startTime}`;

  const oldProviderDocData: OldProviderDocData = {
    clientId: currentProviderDocData.clientId,
    endTime: Date.now(),
    offer: currentProviderDocData.offer,
    providerId: currentProviderDocData.providerId,
    startTime: currentProviderDocData.startTime,
    totalProfit: 53,
  };

  try {
    await firestore.doc(oldProviderDocPath).set({ ...oldProviderDocData });
    return true;
  } catch (error) {
    console.error("Error while creating old provider doc: ", error);
    return false;
  }
}

async function getPostInteractionData(username: string) {
  try {
    const postInteractionsDocSnapshot = await firestore
      .doc(`/users/${username}/personal/postInteractions`)
      .get();

    if (!postInteractionsDocSnapshot.exists) {
      console.warn("postInteractionsDoc doesn't exist.");
      return [];
    }

    const postInteractionsData = postInteractionsDocSnapshot.data();

    if (!postInteractionsData) {
      console.warn("postInteractions data doesn't exist.");
      return [];
    }

    const likedPostsArray = postInteractionsData.likedPostsArray || [];
    const commentedPostsArray = postInteractionsData.commentedPostsArray || [];
    const uploadedPostsArray = postInteractionsData.uploadedPostsArray || [];

    const interactedPostObjectsArray: InteractedPostObject[] = Array.from(
      new Set([
        ...likedPostsArray,
        ...commentedPostsArray,
        ...uploadedPostsArray,
      ])
    );

    return interactedPostObjectsArray;
  } catch (error) {
    console.error("Error while making interaction datas ready: ", error);
    return [];
  }
}

async function sendRequestToProviderServer(
  username: string,
  providerId: string,
  interactedPostsObjectsArray: InteractedPostObject[],
  oldProviderId?: string,
  oldProviderClientId?: string
) {
  const apiKey = keys.API_KEY_BETWEEN_SERVICES;
  if (!apiKey) {
    console.error("API key between services is not defined in config file");
    return false;
  }

  try {
    const response = await fetch(
      externalAPIRoutes.provider.client.selectProvider,
      {
        method: "POST",
        headers: {
          authorization: apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          username: username,
          providerId: providerId,
          interactedPostsObjectsArray: interactedPostsObjectsArray,
          oldProviderId: oldProviderId,
          oldProviderClientId: oldProviderClientId,
        }),
      }
    );

    if (!response.ok) {
      console.error(
        "Response from provider server is not OK: ",
        await response.text()
      );
      return false;
    }

    const result = (await response.json()) as CurrentProviderDocData;

    return result;
  } catch (error) {
    console.error("Error while sending request to provider server: ", error);
    return false;
  }
}

async function createNewCurrentProviderDoc(
  username: string,
  currentProviderDocData: CurrentProviderDocData
) {
  try {
    await firestore
      .doc(`/users/${username}/provider/currentProvider`)
      .set(currentProviderDocData);
    return true;
  } catch (error) {
    console.error("Error while creating new current provider doc: ", error);
    return false;
  }
}

export const selectProvider = onRequest(async (req, res) => {
  const { authorization } = req.headers;
  const { providerName } = req.body;

  const username = await handleAuthorization(authorization);
  if (!username) {
    res.status(401).send("Unauthorized");
    return;
  }

  const checkPropsResult = checkProps(providerName);
  if (!checkPropsResult) {
    res.status(422).send("Invalid Request");
    return;
  }

  const currentProviderDoc = await getActiveProviderDocFromUserSide(username);

  const choosingSameProvider = checkChoosingSameProvider(
    providerName,
    currentProviderDoc ? currentProviderDoc.providerId : ""
  );
  if (choosingSameProvider) {
    res.status(422).send("Invalid Request");
    return;
  }

  const createOldProviderDocForUserResult = await createOldProviderDocForUser(
    currentProviderDoc,
    username
  );
  if (!createOldProviderDocForUserResult) {
    res.status(500).send("Internal Server Error");
    return;
  }

  const postInteractionsData = await getPostInteractionData(username);

  const sendRequestToProviderServerResult = await sendRequestToProviderServer(
    username,
    providerName,
    postInteractionsData,
    currentProviderDoc ? currentProviderDoc.providerId : "",
    currentProviderDoc ? currentProviderDoc.clientId : ""
  );
  if (!sendRequestToProviderServerResult) {
    res.status(500).send("Internal Server Error");
    return;
  }

  const createNewCurrentProviderDocResult = await createNewCurrentProviderDoc(
    username,
    sendRequestToProviderServerResult
  );
  if (!createNewCurrentProviderDocResult) {
    res.status(500).send("Internal Server Error");
    return;
  }

  res.status(200).send("OK");
  return;
});
