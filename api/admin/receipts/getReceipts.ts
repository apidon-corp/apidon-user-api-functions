import {onRequest} from "firebase-functions/v2/https";

import {getConfigObject} from "../../../configs/getConfigObject";
import {firestore} from "../../../firebase/adminApp";
import {ReceiptDocData} from "@/types/Receipt";

const configObject = getConfigObject();

if (!configObject) {
  throw new Error("Config object is undefined");
}

/**
 * Handles the authorization of incoming requests.
 * @param authorization - The authorization header value.
 * @returns True if the authorization is valid, otherwise false.
 */
function handleAuthorization(authorization: string | undefined) {
  if (!authorization) {
    console.error("Authorization header is missing");
    return false;
  }

  if (!configObject) {
    console.error("Config object is undefined");
    return false;
  }

  return authorization === configObject.ADMIN;
}

async function getReceiptsDocs() {
  try {
    const query = await firestore.collection("receipts").get();

    return query.docs.map((doc) => doc.data() as ReceiptDocData);
  } catch (error) {
    console.error("Error getting receipts:", error);
    return false;
  }
}

export const getReceipts = onRequest(async (req, res) => {
  if (!handleAuthorization(req.headers.authorization)) {
    res.status(401).send("Unauthorized");
    return;
  }
  const receipts = await getReceiptsDocs();
  if (!receipts) {
    res.status(500).send("Error getting receipts");
    return;
  }
  res.status(200).send(receipts);
});
