import {
  Environment,
  SignedDataVerifier,
} from "@apple/app-store-server-library";

import * as fs from "fs";

import {onRequest} from "firebase-functions/v2/https";
import {keys} from "../../config";
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

async function decodeNotification(
  signedPayload: string,
  verifier: SignedDataVerifier
) {
  try {
    const decodedNotification = await verifier.verifyAndDecodeNotification(
      signedPayload
    );

    if (!decodedNotification) {
      console.error(
        "Notification type is missing in the decoded notification."
      );
      return false;
    }

    const type = decodedNotification.notificationType;

    console.log("Notification Type: ", type);
    console.log("Decoded Notification: ", decodedNotification);

    const signedTransactionData =
      decodedNotification.data?.signedTransactionInfo;

    if (!signedTransactionData) {
      console.error("Signed transaction data is missing in the notification.");
      return false;
    }

    const decodedTransactionData = await verifier.verifyAndDecodeTransaction(
      signedTransactionData
    );
    console.log("Decoded Transaction Data: ", decodedTransactionData);

    return true;
  } catch (error) {
    console.error("Error decoding notification:", error);
    return false;
  }
}

// Utility function to read and convert a PEM file to DER format
const readCertificate = async (filePath: string): Promise<Buffer> => {
  const data = await readFileAsync(filePath);
  return Buffer.from(data);
};

async function getAppleRootCerts() {
  const certPaths = [
    path.resolve(__dirname, "root_certs/AppleRootCA-G3.pem"),
    path.resolve(__dirname, "root_certs/AppleRootCA-G2.pem"),
    path.resolve(__dirname, "root_certs/AppleComputerRootCertificate.pem"),
    path.resolve(__dirname, "root_certs/AppleIncRootCertificate.pem"),
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

  const payload = req.body.signedPayload;

  if (!payload) {
    console.error("No signedData provided in the request body \n");
    console.error(req.body);
    res.status(400).send("\nBad Request");
    return;
  }

  const decodedNotificationResult = await decodeNotification(payload, verifier);
  if (!decodedNotificationResult) {
    res.status(500).send("Internal Server Error");
    return;
  }

  console.log("Notification Received from Apple.");

  res.status(200).send("Success");
  return;
});
