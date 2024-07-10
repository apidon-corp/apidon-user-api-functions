import { onRequest } from "firebase-functions/v2/https";

import getDisplayName from "../../helpers/getDisplayName";
import {
  ActiveProviderInformation,
  CurrentProviderDocData,
  ProviderInformation,
  ProviderShowcaseItem,
} from "../../types/Provider";
import { externalAPIRoutes, keys } from "../../config";
import { firestore } from "../../firebase/adminApp";

async function handleAuthorization(key: string | undefined) {
  if (key === undefined) {
    console.error("Unauthorized attemp to sendReply API.");
    return false;
  }

  const operationFromUsername = await getDisplayName(key);
  if (!operationFromUsername) return false;

  return operationFromUsername;
}

async function getProviderOptions() {
  const apiKeyBetweenServices = keys.API_KEY_BETWEEN_SERVICES;
  if (!apiKeyBetweenServices) {
    console.error("API key between services is not defined in .env file");
    return false;
  }

  try {
    const response = await fetch(
      externalAPIRoutes.provider.client.provideShowcase,
      {
        method: "POST",
        headers: {
          authorization: apiKeyBetweenServices,
        },
      }
    );

    if (!response.ok) {
      console.error(
        "Error while getting provider options: ",
        await response.text()
      );
      return false;
    }

    const result = (await response.json()) as {
      providersShowcaseDatas: ProviderShowcaseItem[];
    };

    return result.providersShowcaseDatas;
  } catch (error) {
    console.error("Error while getting provider options: ", error);
    return false;
  }
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

async function getDetailedProviderDataFromProviderSide(
  providerId: string,
  clientId: string
) {
  const apiKeyBetweenServices = keys.API_KEY_BETWEEN_SERVICES;
  if (!apiKeyBetweenServices) {
    console.error("API key between services is not defined in config file");
    return false;
  }

  try {
    const response = await fetch(
      externalAPIRoutes.provider.client.provideProviderInformation,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          authorization: apiKeyBetweenServices,
        },
        body: JSON.stringify({
          providerName: providerId,
          clientId: clientId,
        }),
      }
    );

    if (!response.ok) {
      console.error(
        "Error while getting detailed provider data: ",
        await response.text()
      );
      return false;
    }

    const result = (await response.json()) as ActiveProviderInformation;
    return result;
  } catch (error) {
    console.error("Error while getting detailed provider data: ", error);
    return false;
  }
}

export const getProviderInformation = onRequest(async (req, res) => {
  const { authorization } = req.headers;

  const username = await handleAuthorization(authorization);
  if (!username) {
    res.status(401).send("Unauthorized");
    return;
  }

  const providerOptions = await getProviderOptions();
  if (!providerOptions) {
    res.status(500).send("Internal Server Error");
    return;
  }

  const activeProviderData = await getActiveProviderDocFromUserSide(username);
  if (!activeProviderData) {
    const providerInformation: ProviderInformation = {
      isThereActiveProvider: false,
      providerOptions: providerOptions,
    };

    res.status(200).json({ ...providerInformation });
    return;
  }

  const detailedProviderData = await getDetailedProviderDataFromProviderSide(
    activeProviderData.providerId,
    activeProviderData.clientId
  );
  if (!detailedProviderData) {
    res.status(500).send("Internal Server Error");
    return;
  }

  const providerInformation: ProviderInformation = {
    isThereActiveProvider: true,
    providerOptions: providerOptions,
    activeProviderInformation: detailedProviderData,
  };

  res.status(200).json({ ...providerInformation });
  return;
});
