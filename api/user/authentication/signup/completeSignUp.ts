import {WriteBatch} from "firebase-admin/firestore";
import {onRequest} from "firebase-functions/v2/https";
import {auth, firestore} from "../../../../firebase/adminApp";
import {appCheckMiddleware} from "../../../../middleware/appCheckMiddleware";
import {
  NotificationsDocData,
  NotificationSettingsData,
} from "../../../../types/Notifications";
import {UserInServer} from "../../../../types/User";
import {BalanceDocData} from "../../../../types/Wallet";
import AsyncLock = require("async-lock");

/**
 * Handles the authorization by verifying the provided key.
 * @param authorization - The authorization key.
 * @returns The UID and email if authorized, otherwise false.
 */
async function handleAuthorization(authorization: string | undefined) {
  if (authorization === undefined) {
    console.error("Unauthorized attemp to sendReply API.");
    return false;
  }

  const idToken = authorization.split("Bearer ")[1];

  try {
    const decodedToken = await auth.verifyIdToken(idToken);
    return {
      uid: decodedToken.uid,
      email: decodedToken.email || "",
    };
  } catch (error) {
    console.error("Error while verifying ID token:", error);
    return false;
  }
}

function checkProps(username: string, fullname: string) {
  const usernameRegex = /^[a-z0-9]{4,20}$/;
  const usernameRegexTestResult = usernameRegex.test(username);

  if (!usernameRegexTestResult) {
    console.error("Username regex's are failed.");
    return false;
  }

  const fullnameRegex = /^\p{L}{1,20}(?: \p{L}{1,20})*$/u;
  const fullnameRegexTestResult = fullnameRegex.test(fullname);

  if (!fullnameRegexTestResult) {
    console.error("Fullname regex's are failed.");
    return false;
  }

  return true;
}

async function checkUsername(username: string) {
  try {
    const suspectedUserDocSnapshot = await firestore
      .doc(`users/${username}`)
      .get();

    if (!suspectedUserDocSnapshot.exists) {
      return true;
    }

    console.error("Username is not available.");
    return false;
  } catch (error) {
    console.error("Error while checking username: ", error);
    return false;
  }
}

async function modifyingAuthObject(uid: string, username: string) {
  try {
    await auth.updateUser(uid, {displayName: username});
    await auth.setCustomUserClaims(uid, {
      name: username,
      isValidAuthObject: true,
    });

    return true;
  } catch (error) {
    console.error("Error while modifying auth object: ", error);
    return false;
  }
}

function createUsernameDoc(batch: WriteBatch, username: string) {
  const usernameDocRef = firestore.doc(`usernames/${username}`);
  batch.set(usernameDocRef, {});
}

function createUserDocData(
  batch: WriteBatch,
  username: string,
  uid: string,
  email: string,
  fullname: string
) {
  const userDocData: UserInServer = {
    email: email,
    followerCount: 0,
    followingCount: 0,
    fullname: fullname,
    collectibleCount: 0,
    profilePhoto: "",
    uid: uid,
    username: username,
    verified: false,
  };

  const userDocRef = firestore.doc(`users/${username}`);
  batch.set(userDocRef, userDocData);
}

function createNotificationsDoc(batch: WriteBatch, username: string) {
  const notificationsDocData: NotificationsDocData = {
    lastOpenedTime: Date.now(),
  };

  const notificationsDocRef = firestore.doc(
    `users/${username}/notifications/notifications`
  );
  batch.set(notificationsDocRef, notificationsDocData);
}

function createNotificationSettingsDoc(batch: WriteBatch, username: string) {
  const notificationSettingsDocData: NotificationSettingsData = {
    notificationToken: "",
  };

  const notificationSettingsDocRef = firestore.doc(
    `users/${username}/notifications/notificationSettings`
  );

  batch.set(notificationSettingsDocRef, notificationSettingsDocData);
}

function createBalanceDoc(batch: WriteBatch, username: string) {
  const balanceData: BalanceDocData = {
    balance: 0,
    currency: "USD",
  };

  const balanceDocRef = firestore.doc(`users/${username}/wallet/balance`);

  batch.set(balanceDocRef, balanceData);
}

async function createUserOnFirestore(
  username: string,
  authResult: { uid: string; email: string },
  fullname: string
) {
  try {
    const batch = firestore.batch();
    createUsernameDoc(batch, username);
    createUserDocData(
      batch,
      username,
      authResult.uid,
      authResult.email,
      fullname
    );

    createNotificationsDoc(batch, username);
    createNotificationSettingsDoc(batch, username);
    createBalanceDoc(batch, username);

    await batch.commit();

    return true;
  } catch (error) {
    console.error("Error while creating user on firestore: ", error);
    return false;
  }
}

async function rollBackAuthModification(uid: string) {
  console.log("Rolling back auth modification...");

  try {
    await auth.updateUser(uid, {
      displayName: undefined,
    });

    return true;
  } catch (error) {
    console.error("Error while rolling back auth modification: ", error);
    return false;
  }
}

const lock = new AsyncLock();

const processCompleteSignUp = async (
  authorization: string | undefined,
  username: string,
  fullname: string
) => {
  const authResult = await handleAuthorization(authorization);
  if (!authResult) {
    throw new Error("Unauthorized");
  }

  const checkPropsResult = checkProps(username, fullname);
  if (!checkPropsResult) {
    throw new Error("Invalid Props");
  }

  const checkUsernameResult = await checkUsername(username);
  if (!checkUsernameResult) {
    throw new Error("Username is not available.");
  }

  const modifyingAuthObjectResult = await modifyingAuthObject(
    authResult.uid,
    username
  );
  if (!modifyingAuthObjectResult) {
    throw new Error("Internal server error");
  }

  const createUserOnFirestoreResult = await createUserOnFirestore(
    username,
    authResult,
    fullname
  );
  if (!createUserOnFirestoreResult) {
    await rollBackAuthModification(authResult.uid);
    throw new Error("Internal server error.");
  }
};

export const completeSignUp = onRequest(
  appCheckMiddleware(async (req, res) => {
    const {authorization} = req.headers;
    const {username, fullname} = req.body;

    const lockId = `signup-${username}`;

    try {
      await lock.acquire(lockId, async () => {
        await processCompleteSignUp(authorization, username, fullname);
        res.status(200).send("Successfull");
      });
    } catch (error) {
      console.error("Error while completing sign up: ", error);
      res.status(500).send("Internal Server Error");
    }
  })
);
