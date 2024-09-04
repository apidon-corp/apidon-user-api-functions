import {onRequest} from "firebase-functions/v2/https";
import {appCheckMiddleware} from "../../../../middleware/appCheckMiddleware";
import {auth, firestore} from "../../../../firebase/adminApp";
import {WriteBatch} from "firebase-admin/firestore";
import {UserInServer} from "../../../../types/User";
import {CollectibleTradeDocData} from "../../../../types/Trade";
import {
  NotificationDocData,
  NotificationSettingsData,
} from "../../../../types/Notifications";
import {BalanceDocData} from "../../../../types/Wallet";
import {CollectibleUsageDocData} from "@/types/CollectibleUsage";
import {calculateCollectibleLimit, PlanDocData} from "@/types/Plan";

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
    frenScore: 0,
    nftCount: 0,
    profilePhoto: "",
    uid: uid,
    username: username,
  };

  const userDocRef = firestore.doc(`users/${username}`);
  batch.set(userDocRef, userDocData);
}

function createCollectibleTradeDoc(batch: WriteBatch, username: string) {
  const collectibleTradeData: CollectibleTradeDocData = {
    createdCollectibles: [],
    boughtCollectibles: [],
    soldCollectibles: [],
  };

  const collectibleTradeDocRef = firestore.doc(
    `users/${username}/collectible/trade`
  );
  batch.set(collectibleTradeDocRef, collectibleTradeData);
}

async function getFreeLimit() {
  try {
    const freeDocSnapshot = await firestore.doc("plans/free").get();

    if (!freeDocSnapshot.exists) {
      console.error("Free plan does not exist");
      return false;
    }

    const data = freeDocSnapshot.data() as PlanDocData;

    if (!data) {
      console.error("Free plan does not exist");
      return false;
    }

    const limit = calculateCollectibleLimit(data.collectible);

    return limit;
  } catch (error) {
    console.error("Error getting free limit", error);
    return false;
  }
}

function createUsageDoc(
  batch: WriteBatch,
  username: string,
  freeLimit: number
) {
  const usageDocRef = firestore.doc(`users/${username}/collectible/usage`);

  const data: CollectibleUsageDocData = {
    limit: freeLimit,
    planId: "free",
    subscriptionDocPath: "",
    used: 0,
  };

  batch.set(usageDocRef, data);
}

function createNotificationsDoc(batch: WriteBatch, username: string) {
  const notificationsDocData: NotificationDocData = {
    lastOpenedTime: Date.now(),
    notifications: [],
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

function createPostInteractions(batch: WriteBatch, username: string) {
  const postInteractionsDocData = {
    commentedPostsArray: [],
    likedPostsArray: [],
    uploadedPostsArray: [],
  };

  const postInteractionsDocRef = firestore.doc(
    `users/${username}/personal/postInteractions`
  );
  batch.set(postInteractionsDocRef, postInteractionsDocData);
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
  fullname: string,
  freeLimit: number
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
    createCollectibleTradeDoc(batch, username);
    createUsageDoc(batch, username, freeLimit);
    createNotificationsDoc(batch, username);
    createNotificationSettingsDoc(batch, username);
    createPostInteractions(batch, username);
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

export const completeSignUp = onRequest(
  appCheckMiddleware(async (req, res) => {
    const {authorization} = req.headers;
    const {username, fullname} = req.body;

    const authResult = await handleAuthorization(authorization);
    if (!authResult) {
      res.status(401).send("Unauthorized");
      return;
    }

    const checkPropsResult = checkProps(username, fullname);
    if (!checkPropsResult) {
      res.status(422).send("Invalid Props");
      return;
    }

    const checkUsernameResult = await checkUsername(username);
    if (!checkUsernameResult) {
      res.status(409).send("Username is not available.");
      return;
    }

    const modifyingAuthObjectResult = await modifyingAuthObject(
      authResult.uid,
      username
    );
    if (!modifyingAuthObjectResult) {
      res.status(500).send("Internal server error");
      return;
    }

    const freeLimit = await getFreeLimit();
    if (freeLimit === false) {
      res.status(500).send("Internal server error");
      return;
    }

    const createUserOnFirestoreResult = await createUserOnFirestore(
      username,
      authResult,
      fullname,
      freeLimit
    );
    if (!createUserOnFirestoreResult) {
      await rollBackAuthModification(authResult.uid);
      res.status(500).send("Internal server error.");

      return;
    }

    res.status(200).send("OK");
    return;
  })
);
