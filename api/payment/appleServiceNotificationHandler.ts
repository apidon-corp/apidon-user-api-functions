import {
  Environment,
  SignedDataVerifier,
} from "@apple/app-store-server-library";

import * as fs from "fs";

import { onRequest } from "firebase-functions/v2/https";
import { keys } from "../../config";
import * as path from "path";

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

// async function requestTestNotification(client: AppStoreServerAPIClient) {
//   try {
//     const response = await client.requestTestNotification();
//     console.log("Test Notification Response: \n", response);
//     return response;
//   } catch (error) {
//     console.error("Error requesting test notification:", error);
//     return false;
//   }
// }

// Utility function to read and convert a PEM file to DER format
const readCertificate = async (filePath: string): Promise<Buffer> => {
  const pem = await readFileAsync(filePath);
  // Convert PEM to DER by removing header, footer, and newlines
  const base64 = pem
    .replace(/-----BEGIN CERTIFICATE-----/g, "")
    .replace(/-----END CERTIFICATE-----/g, "")
    .replace(/\s+/g, "");
  return Buffer.from(base64, "base64");
};

async function getAppleRootCerts() {
  const certPaths = [
    path.resolve(__dirname, "root_certs/AppleRootCA-G3.cer"),
    path.resolve(__dirname, "root_certs/AppleRootCA-G2.cer"),
    path.resolve(__dirname, "root_certs/AppleComputerRootCertificate.cer"),
    path.resolve(__dirname, "root_certs/AppleIncRootCertificate.cer"),
  ];

  const appleRootCertificates = await Promise.all(
    certPaths.map(readCertificate)
  );

  return appleRootCertificates;
}

export const appleServiceNotificationsHandler = onRequest(async (req, res) => {
  const bundleId = keys.appleInAppPurchaseKeys.bundleId;
  const environment = Environment.SANDBOX;

  const encodedKey = await getEncodedKey();

  if (!encodedKey) {
    res.status(500).send("Internal Server Error");
    return;
  }

  const enableOnChecks = true;
  const appApppleId = keys.appleInAppPurchaseKeys.appAppleId;
  const appleCerts = await getAppleRootCerts();

  const verifier = new SignedDataVerifier(
    appleCerts,
    enableOnChecks,
    environment,
    bundleId,
    appApppleId
  );

  const payload = req.body.signedData;

  if (!payload) {
    console.error("No signedData provided in the request body \n");
    console.error(req.body);
    res.status(400).send("\nBad Request");
    return;
  }

  const decodedNotification = await verifier.verifyAndDecodeNotification(
    payload
  );

  console.log("Decoded Notification: \n", decodedNotification);

  res.status(200).send("Success");
  return;
});
