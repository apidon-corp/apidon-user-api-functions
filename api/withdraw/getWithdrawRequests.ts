import {onRequest} from "firebase-functions/v2/https";

import {firestore} from "../../firebase/adminApp";
import {getConfigObject} from "../../configs/getConfigObject";

import {WithdrawRequestDocData} from "../../types/Withdraw";

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

  const authResult = handleAuthorization(authorization);
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
