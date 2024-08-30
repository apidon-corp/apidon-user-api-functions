import { onRequest } from "firebase-functions/v2/https";

import getDisplayName from "../../helpers/getDisplayName";

import { firestore } from "../../firebase/adminApp";

import { BalanceDocData } from "../../types/Wallet";
import { FieldValue } from "firebase-admin/firestore";
import { WithdrawRequestDocData } from "../../types/Withdraw";

import { UserIdentityDoc } from "../../types/Identity";
import { appCheckMiddleware } from "../../middleware/appCheckMiddleware";

async function handleAuthorization(key: string | undefined) {
  if (key === undefined) {
    console.error("Unauthorized attemp to requestWithdraw API.");
    return false;
  }

  const operationFromUsername = await getDisplayName(key);
  if (!operationFromUsername) return false;

  return operationFromUsername;
}

function checkProps(
  bankName: string,
  accountNumber: string,
  swiftCode: string
) {
  if (!bankName || !accountNumber || !swiftCode) return false;
  return true;
}

async function getBalance(username: string) {
  try {
    const balanceDocSnapshot = await firestore
      .doc(`users/${username}/wallet/balance`)
      .get();

    if (!balanceDocSnapshot.exists) {
      console.error("User's balance document doesn't exist");
      return false;
    }
    const balanceData = balanceDocSnapshot.data() as BalanceDocData;

    if (!balanceData) {
      console.error("User's balance data doesn't exist");
      return false;
    }

    return balanceData.balance;
  } catch (error) {
    console.error("Error getting balance:", error);
    return false;
  }
}

function checkBalance(balance: number) {
  // Balance need to be higher than $20 (transfer fee)
  if (balance < 20) return false;
  return true;
}

async function getAccountHolderName(username: string) {
  try {
    const identityDocSnapshot = await firestore
      .doc(`users/${username}/personal/identity`)
      .get();

    if (!identityDocSnapshot.exists) {
      console.error("User's identity document doesn't exist");
      return false;
    }

    const data = identityDocSnapshot.data() as UserIdentityDoc;

    if (!data) {
      console.error("User's identity data doesn't exist");
      return false;
    }

    if (data.status !== "verified") {
      console.error("User's identity is not verified");
      return false;
    }

    return `${data.firstName} ${data.lastName}`;
  } catch (error) {
    console.error("Error getting account holder name:", error);
    return false;
  }
}

// Making balance zero.
async function updateBalance(username: string) {
  try {
    const balanceDocRef = firestore.doc(`users/${username}/wallet/balance`);

    await balanceDocRef.update({ balance: 0 });

    return true;
  } catch (error) {
    console.error("Error updating balance:", error);
    return false;
  }
}

// Use if any other operations are failed.
async function rollbackBalance(username: string, balance: number) {
  try {
    const balanceDocRef = firestore.doc(`users/${username}/wallet/balance`);

    await balanceDocRef.update({ balance: FieldValue.increment(balance) });

    return true;
  } catch (error) {
    console.error("Error updating balance:", error);
    return false;
  }
}

async function createPayoutRequestDoc(data: WithdrawRequestDocData) {
  try {
    const newPayoutRequestRef = firestore.doc(
      `payouts/requests/${data.username}/${data.requestId}`
    );
    await newPayoutRequestRef.set(data);
    return true;
  } catch (error) {
    console.error("Error creating payout request:", error);
    return false;
  }
}

export const requestWithdraw = onRequest(
  appCheckMiddleware(async (req, res) => {
    const { authorization } = req.headers;
    const { bankName, accountNumber, swiftCode, routingNumber } = req.body;

    const username = await handleAuthorization(authorization);
    if (!username) {
      res.status(401).send("Unauthorized");
      return;
    }

    const checkPropsResult = checkProps(bankName, accountNumber, swiftCode);
    if (!checkPropsResult) {
      res.status(422).send("Invalid Request");
      return;
    }

    const balance = await getBalance(username);

    if (balance === false) {
      res.status(500).send("Internal Server Error");
      return;
    }

    if (!checkBalance(balance)) {
      res.status(422).send("Insufficient Balance");
      return;
    }

    const accountHolderName = await getAccountHolderName(username);
    if (!accountHolderName) {
      res.status(500).send("Internal Server Error");
      return;
    }

    const updateBalanceResult = await updateBalance(username);
    if (!updateBalanceResult) {
      res.status(500).send("Internal Server Error");
      return;
    }

    const ts = Date.now();

    const createPayoutRequesDocResult = await createPayoutRequestDoc({
      bankDetails: {
        accountHolderName: accountHolderName,
        accountNumber: accountNumber,
        bankName: bankName,
        swiftCode: swiftCode,
        routingNumber: routingNumber || "",
      },
      currency: "USD",
      notes: "",
      requestedAmount: balance,
      requestedDate: ts,
      requestId: username + "-" + ts.toString(),
      status: "pending",
      username: username,
    });

    if (!createPayoutRequesDocResult) {
      await rollbackBalance(username, balance);
      res.status(500).send("Internal Server Error");
      return;
    }

    res.status(200).send("Success");

    return;
  })
);
