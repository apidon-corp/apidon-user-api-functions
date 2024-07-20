import {onRequest} from "firebase-functions/v2/https";

import getDisplayName from "../../helpers/getDisplayName";
import {firestore} from "../../firebase/adminApp";
import {keys} from "../../config";

import {CurrentProviderDocData} from "../../types/Provider";
import {appCheckMiddleware} from "../../middleware/appCheckMiddleware";

async function handleAuthorization(key: string | undefined) {
  if (key === undefined) {
    console.error("Unauthorized attemp to sendReply API.");
    return false;
  }

  const operationFromUsername = await getDisplayName(key);
  if (!operationFromUsername) return false;

  return operationFromUsername;
}

async function getFollowingsOfUser(username: string) {
  try {
    const followingQuery = await firestore
      .collection(`/users/${username}/followings`)
      .get();

    const followings = followingQuery.docs.map((f) => f.id);

    return followings;
  } catch (error) {
    console.error("Error while getting followings of user: ", error);
    return false;
  }
}

async function getProviderInformation(username: string) {
  try {
    const providerDocSnapshot = await firestore
      .doc(`/users/${username}/provider/currentProvider`)
      .get();
    if (!providerDocSnapshot.exists) {
      console.error("Provider information does not exist.");
      return false;
    }

    const providerDocData =
      providerDocSnapshot.data() as CurrentProviderDocData;
    if (!providerDocData) {
      console.error("Provider information is undefined.");
      return false;
    }

    const providerId = providerDocData.providerId;
    const clientId = providerDocData.clientId;

    return {
      providerId: providerId,
      clientId: clientId,
    };
  } catch (error) {
    console.error("Error while getting provider information: ", error);
    return false;
  }
}

async function getPostPredictionsFromProvider(
  username: string,
  providerName: string,
  clientId: string
) {
  const apiEndPointToProviderServer =
    keys.API_ENDPOINT_TO_APIDON_PROVIDER_SERVER;

  if (!apiEndPointToProviderServer) {
    console.error(
      "API Endpoint to provider server is invalid (we were getting it from .env file)"
    );
    return false;
  }

  const apikeyBetweenServices = keys.API_KEY_BETWEEN_SERVICES;
  if (!apikeyBetweenServices) {
    console.error(
      "API Key between services is invalid (we were getting it from .env file)"
    );
    return false;
  }

  try {
    const response = await fetch(
      `${apiEndPointToProviderServer}/client/provideFeed`,
      {
        method: "POST",
        headers: {
          "authorization": apikeyBetweenServices,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          username: username,
          provider: providerName,
          clientId: clientId,
        }),
      }
    );

    if (!response.ok) {
      console.error(
        "Resposne from provideFeed API (provider side) is not okay: \n",
        await response.text()
      );
      return false;
    }

    const result = await response.json();

    const postDocPathArray = result.postDocPathArray as string[];
    return {
      postDocPathArray: postDocPathArray,
    };
  } catch (error) {
    console.error(
      "Error while getting post predictions from provider: ",
      error
    );
    return false;
  }
}

export const getPersonalizedFeed = onRequest(
  appCheckMiddleware(async (req, res) => {
    const {authorization} = req.headers;

    const username = await handleAuthorization(authorization);
    if (!username) {
      res.status(401).send("Unauthorized");
      return;
    }

    const followingsOfUser = await getFollowingsOfUser(username);
    if (!followingsOfUser) {
      res.status(500).send("Internal Server Error");
      return;
    }

    const providerData = await getProviderInformation(username);
    if (!providerData) {
      res.status(500).send("Internal Server Error");
      return;
    }

    const getPostPredictionsFromProviderResult =
      await getPostPredictionsFromProvider(
        username,
        providerData.providerId,
        providerData.clientId
      );
    if (!getPostPredictionsFromProviderResult) {
      res.status(500).send("Internal Server Error");
      return;
    }

    res.status(200).json({
      postDocPathArray: getPostPredictionsFromProviderResult.postDocPathArray,
    });
    return;
  })
);
