import { onRequest } from "firebase-functions/v2/https";
import getDisplayName from "../../helpers/getDisplayName";
import { firestore } from "../../firebase/adminApp";
import { CurrentProviderDocData, RatingsDocData } from "../../types/Provider";
import { FieldValue } from "firebase-admin/firestore";
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

async function checkProps(score: number) {
  return score <= 5 && score >= 1;
}

async function getCurrentProvider(username: string) {
  try {
    const currentProviderDocSnapshot = await firestore
      .doc(`/users/${username}/provider/currentProvider`)
      .get();

    if (!currentProviderDocSnapshot.exists) {
      console.error("Current provider doc doesn't exist.");
      return false;
    }

    const currentProviderDocData =
      currentProviderDocSnapshot.data() as CurrentProviderDocData;

    if (!currentProviderDocData) {
      console.error("Current provider doc data doesn't exist.");
      return false;
    }

    return currentProviderDocData;
  } catch (error) {
    console.error("Error while getting current provider doc: ", error);
    return false;
  }
}

async function updateRatingsDoc(
  username: string,
  currentProviderDocData: CurrentProviderDocData,
  score: number
) {
  try {
    const ratingsDocRef = await firestore
      .doc(`/users/${username}/provider/ratings`)
      .get();

    if (!ratingsDocRef.exists) {
      console.error("Ratings doc doesn't exist.");
      return false;
    }

    const ratingsDocData = ratingsDocRef.data() as RatingsDocData;

    const ratings = ratingsDocData.ratings;

    const existingRatingData = ratings.find(
      (r) => r.providerId === currentProviderDocData.providerId
    );

    if (existingRatingData) {
      await ratingsDocRef.ref.update({
        ratings: FieldValue.arrayRemove(existingRatingData),
      });
    }

    const newRatingData = {
      providerId: currentProviderDocData.providerId,
      score: score,
    };

    await ratingsDocRef.ref.update({
      ratings: FieldValue.arrayUnion(newRatingData),
    });

    return true;
  } catch (error) {
    console.error("Error while updating ratings doc: ", error);
    return false;
  }
}

async function sendRateToProviderSide(
  username: string,
  providerId: string,
  score: number
) {
  const apiKey = keys.API_KEY_BETWEEN_SERVICES;
  if (!apiKey) {
    console.error("API key between services is not defined in config file");
    return false;
  }

  try {
    const response = await fetch(externalAPIRoutes.provider.client.takeRate, {
      method: "POST",
      headers: {
        authorization: apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        score: score,
        provider: providerId,
        username: username,
      }),
    });
    if (!response.ok) {
      console.error(
        "Error while rating provider. (We were sending rate to provider side...)",
        await response.text()
      );
      return false;
    }
    return true;
  } catch (error) {
    console.error(
      "Error while rating provider. (We were sending rate to provider side...)",
      error
    );
    return false;
  }
}

export const rateProvider = onRequest(async (req, res) => {
  const { authorization } = req.headers;
  const { score } = req.body;

  const username = await handleAuthorization(authorization);
  if (!username) {
    res.status(401).send("Unauthorized");
    return;
  }

  const checkPropsResult = checkProps(score);
  if (!checkPropsResult) {
    res.status(422).send("Invalid Request");
    return;
  }

  const getCurrentProviderResult = await getCurrentProvider(username);
  if (!getCurrentProviderResult) {
    res.status(500).send("Internal Server Error");
    return;
  }

  const updateRatingsDocResult = await updateRatingsDoc(
    username,
    getCurrentProviderResult,
    score
  );
  if (!updateRatingsDocResult) {
    res.status(500).send("Internal Server Error");
    return;
  }

  const sendRateToProviderSideResult = await sendRateToProviderSide(
    username,
    getCurrentProviderResult.providerId,
    score
  );
  if (!sendRateToProviderSideResult) {
    res.status(500).send("Internal Server Error");
    return;
  }

  res.status(200).send("Success");
  return;
});
