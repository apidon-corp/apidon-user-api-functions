import {onRequest} from "firebase-functions/v2/https";
import {keys} from "../../../../config";
import {ReferenceDocData} from "../../../../types/Reference";
import {firestore} from "../../../../firebase/adminApp";

function handleAuthorization(authorization: string | undefined) {
  if (!authorization) {
    console.error("Authorization key is undefined.");
    return false;
  }

  const apiKey = keys.CREATE_REFERRAL_CODE_KEY;
  if (!apiKey) {
    console.error("API KEY is undefined from .env file.");
    return false;
  }

  return authorization === apiKey;
}

async function createReferenceCode() {
  const newReferenceDocData: ReferenceDocData = {
    inProcess: false,
    isUsed: false,
    ts: 0,
    whoUsed: "",
  };

  try {
    const createdReferenceDoc = await firestore
      .collection("/references")
      .add({...newReferenceDocData});

    const docId = createdReferenceDoc.id;

    return docId;
  } catch (error) {
    console.error("Error on creating reference code: \n", error);
    return false;
  }
}

export const createReferralCode = onRequest(async (req, res) => {
  const {authorization} = req.headers;

  const authorizationResult = handleAuthorization(authorization);
  if (!authorizationResult) {
    res.status(401).send("Unauthorized");
    return;
  }

  const createReferenceCodeResult = await createReferenceCode();
  if (!createReferenceCodeResult) {
    res.status(500).send("Internal server error");
    return;
  }

  res.status(200).json({referenceCode: createReferenceCodeResult});
  return;
});
