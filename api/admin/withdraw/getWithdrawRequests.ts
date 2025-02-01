import {onRequest} from "firebase-functions/https";

import {firestore} from "../../../firebase/adminApp";

import {WithdrawRequestDocData} from "../../../types/Withdraw";
import {handleAdminAuthorization} from "../../../helpers/handleAdminAuthorization";

/**
 * Fetches all usernames from the Firestore collection.
 * @returns A list of usernames or false if an error occurs.
 */
async function getAllUsers() {
  try {
    const usernameCollectionSnapshot = await firestore
      .collection("usernames")
      .get();
    const usernames = usernameCollectionSnapshot.docs.map((doc) => doc.id);
    return usernames;
  } catch (error) {
    console.error("Error on getting all usernames: ", error);
    return false;
  }
}

async function getWithdrawRequestsOfOneUser(username: string) {
  console.log("Username: ", username);

  try {
    const query = await firestore
      .collection(`/payouts/requests/${username}`)
      .get();

    return query.docs.map((doc) => doc.data() as WithdrawRequestDocData);
  } catch (error) {
    console.error("Error on getting withdraw requests of one user: ", error);
    return false;
  }
}

async function getWithdrawRequestsOfAllUsers(usernames: string[]) {
  try {
    const withdrawRequests = await Promise.all(
      usernames.map(getWithdrawRequestsOfOneUser)
    );
    return withdrawRequests.filter((requests) => requests !== false).flat();
  } catch (error) {
    console.error("Error on getting withdraw requests of all users: ", error);
    return false;
  }
}

export const getWithdrawRequests = onRequest(async (req, res) => {
  const {authorization} = req.headers;

  const authResult = await handleAdminAuthorization(authorization);
  if (!authResult) {
    res.status(401).send("Unauthorized");
    return;
  }

  const users = await getAllUsers();
  if (!users) {
    res.status(500).send("Internal Server Error");
    return;
  }

  const withdrawRequests = await getWithdrawRequestsOfAllUsers(users);
  if (!withdrawRequests) {
    res.status(500).send("Internal Server Error");
    return;
  }
  res.status(200).send(withdrawRequests);
});
