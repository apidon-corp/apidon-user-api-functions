import {onRequest} from "firebase-functions/v2/https";

import {firestore} from "../../../firebase/adminApp";

import {FieldValue} from "firebase-admin/firestore";
import {WithdrawRequestDocData} from "../../../types/Withdraw";
import {handleAdminAuthorization} from "../../../helpers/handleAdminAuthorization";

function checkProps(username: string, requestId: string, notes: string) {
  if (!username || !requestId || !notes) return false;
  return true;
}

async function getAmountDataForRefund(username: string, requestId: string) {
  try {
    const payoutRequestsDocSnapshot = await firestore
      .doc(`payouts/requests/${username}/${requestId}`)
      .get();

    if (!payoutRequestsDocSnapshot.exists) {
      console.error("Payout request doc doesn't exist");
      return false;
    }
    const payoutRequestsDocData =
      payoutRequestsDocSnapshot.data() as WithdrawRequestDocData;

    if (!payoutRequestsDocData) {
      console.error("Payout request doc data doesn't exist");
      return false;
    }

    if (payoutRequestsDocData.status === "rejected") {
      console.error("Payout request is already rejected");
      return false;
    }

    return payoutRequestsDocData.requestedAmount;
  } catch (error) {
    console.error("Error on getting amount data for refund: ", error);
    return false;
  }
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
      status: "rejected",
      notes: notes,
    });

    return true;
  } catch (error) {
    console.error("Error on updating payout request doc: ", error);
    return false;
  }
}

async function rollbackPayoutRequestDoc(username: string, requestId: string) {
  try {
    const payoutRequestDocRef = firestore.doc(
      `payouts/requests/${username}/${requestId}`
    );

    await payoutRequestDocRef.update({
      status: "pending",
      notes: "Your request is being processed.",
    });

    return true;
  } catch (error) {
    console.error("Error on updating payout request doc: ", error);
    return false;
  }
}

async function updateBalance(username: string, amountToRefund: number) {
  try {
    const balanceDocRef = firestore.doc(`users/${username}/wallet/balance`);

    await balanceDocRef.update({
      balance: FieldValue.increment(amountToRefund),
    });
    return true;
  } catch (error) {
    console.error("Error on updating balance: ", error);
    return false;
  }
}

export const rejectWithdraw = onRequest(async (req, res) => {
  const {authorization} = req.headers;
  const {username, requestId, notes} = req.body;

  if (!handleAdminAuthorization(authorization)) {
    res.status(401).send("Unauthorized");
    return;
  }

  if (!checkProps(username, requestId, notes)) {
    res.status(422).send("Invalid Request");
    return;
  }

  const amountToRefund = await getAmountDataForRefund(username, requestId);
  if (amountToRefund === false) {
    res.status(500).send("Internal Server Error");
    return;
  }

  const updateResult = await updatePayoutRequestDoc(username, requestId, notes);
  if (!updateResult) {
    res.status(500).send("Internal Server Error");
    return;
  }

  const updateBalanceDocResult = await updateBalance(username, amountToRefund);
  if (!updateBalanceDocResult) {
    await rollbackPayoutRequestDoc(username, requestId);
    res.status(500).send("Internal Server Error");
    return;
  }

  res.status(200).send("OK");
});
