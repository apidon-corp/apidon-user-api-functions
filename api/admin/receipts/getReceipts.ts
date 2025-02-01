import {onRequest} from "firebase-functions/https";

import {handleAdminAuthorization} from "../../../helpers/handleAdminAuthorization";
import {ReceiptDocData} from "@/types/Receipt";
import {firestore} from "../../../firebase/adminApp";

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
  if (!(await handleAdminAuthorization(req.headers.authorization))) {
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
