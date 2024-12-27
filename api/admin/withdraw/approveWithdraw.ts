import {onRequest} from "firebase-functions/v2/https";

import {handleAdminAuthorization} from "../../../helpers/handleAdminAuthorization";
import {firestore} from "../../../firebase/adminApp";

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

  const authResult = handleAdminAuthorization(authorization);
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
