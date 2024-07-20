import {
  AppStoreServerAPIClient,
  Environment,
} from "@apple/app-store-server-library";

import * as fs from "fs";

import { onRequest } from "firebase-functions/v2/https";
import * as path from "path";
import { keys } from "../../config";

const readFileAsync = async (filePath: string): Promise<string> => {
  return await fs.promises.readFile(filePath, "utf8");
};

async function getEncodedKey() {
  try {
    const filePath = path.join(__dirname, "SubscriptionKey_KP9HCU8RS2.p8");
    const data = await readFileAsync(filePath);
    return data;
  } catch (error) {
    console.error("Error reading subscription_key file:", error);
    return false;
  }
}

async function requestTestNotification(client: AppStoreServerAPIClient) {
  try {
    const response = await client.requestTestNotification();
    console.log("Test Notification Response: \n", response);
    return response;
  } catch (error) {
    console.error("Error requesting test notification:", error);
    return false;
  }
}

export const sendTestNotification = onRequest(async (req, res) => {
  const issuerId = keys.appleInAppPurchaseKeys.issuerId;
  const keyId = keys.appleInAppPurchaseKeys.keyId;
  const bundleId = keys.appleInAppPurchaseKeys.bundleId;
  const environment = Environment.SANDBOX;

  const encodedKey = await getEncodedKey();

  if (!encodedKey) {
    res.status(500).send("Internal Server Error");
    return;
  }

  const client = new AppStoreServerAPIClient(
    encodedKey,
    keyId,
    issuerId,
    bundleId,
    environment
  );

  const requestTestNotificationResult = await requestTestNotification(client);
  if (!requestTestNotificationResult) {
    res.status(500).send("Internal Server Error");
    return;
  }

  res.status(200).send("Success on sending test notification.");
  return;
});
