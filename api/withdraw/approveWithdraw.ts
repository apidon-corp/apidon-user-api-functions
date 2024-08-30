import {getConfigObject} from "../../configs/getConfigObject";
import {onRequest} from "firebase-functions/v2/https";

import {firestore} from "../../firebase/adminApp";

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

  return authorization === configObject.APPROVE_WITHDRAW_API_KEY;
}

function checkProps(username: string, requestId: string, notes: string) {
  if (!username || !requestId || !notes) return false;
  return true;
}

async function updatePayoutRequestDoc(
  username: string,
  requestId: string,
  notes: string
) {
  try {
    const payoutRequestDocRef = firestore.doc(
      `payouts/requests/${username}/${requestId}`
    );

    await payoutRequestDocRef.update({
      status: "approved",
      notes: notes,
    });

    return true;
  } catch (error) {
    console.error("Error on updating payout request doc: ", error);
    return false;
  }
}

export const approveWithdraw = onRequest(async (req, res) => {
  const {authorization} = req.headers;

  const {username, requestId, notes} = req.body;

  const authResult = handleAuthorization(authorization);
  if (!authResult) {
    res.status(401).send("Unauthorized");
    return;
  }

  const propsResult = checkProps(username, requestId, notes);
  if (!propsResult) {
    res.status(422).send("Invalid Request");
    return;
  }

  const updateResult = await updatePayoutRequestDoc(username, requestId, notes);
  if (!updateResult) {
    res.status(500).send("Internal Server Error");
    return;
  }

  res.status(200).send("OK");
  return;
});
