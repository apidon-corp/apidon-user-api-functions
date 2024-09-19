import {onRequest} from "firebase-functions/v2/https";

import {firestore} from "../../firebase/adminApp";

import {
  BoughtCollectibleDocData,
  CollectibleTradeDocData,
  CreatedCollectibleDocData,
  SoldCollectibleDocData,
} from "../../types/Trade";
import {FieldValue} from "firebase-admin/firestore";
import {getConfigObject} from "../../configs/getConfigObject";

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

  return authorization === configObject.GET_ALL_POSTS_API_KEY;
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

async function convertAllUsers(usernames: string[]) {
  try {
    const results = await Promise.all(usernames.map(convertOneUser));
    return results;
  } catch (error) {
    console.error("Error on converting all users: ", error);
    return false;
  }
}

async function convertOneUser(username: string) {
  try {
    const tradeDoc = await firestore
      .doc(`users/${username}/collectible/trade`)
      .get();

    if (!tradeDoc.exists) return true;

    const data = tradeDoc.data() as CollectibleTradeDocData;

    const [
      handleBoughtCollectiblesResult,
      handleCreatedCollectiblesResult,
      handleSoldCollectiblesResult,
    ] = await Promise.all([
      handleBoughtCollectibles(data, username, tradeDoc),
      handleCreatedCollectibles(data, username, tradeDoc),
      handleSoldCollectibles(data, username, tradeDoc),
    ]);
    if (
      !handleBoughtCollectiblesResult ||
      !handleCreatedCollectiblesResult ||
      !handleSoldCollectiblesResult
    ) {
      console.error("Error on converting one user: ");
      return false;
    }

    return true;
  } catch (error) {
    console.error("Error on converting one user: ", error);
    return false;
  }
}

async function handleBoughtCollectibles(
  data: CollectibleTradeDocData,
  username: string,
  tradeDocRef: FirebaseFirestore.DocumentSnapshot<
    FirebaseFirestore.DocumentData,
    FirebaseFirestore.DocumentData
  >
) {
  try {
    await Promise.all(
      data.boughtCollectibles.map((b) => {
        const newData: BoughtCollectibleDocData = {
          collectibleDocPath: b.collectibleDocPath,
          postDocPath: b.postDocPath,
          ts: b.ts,
        };
        addDocToBoughtCollectiblesCollection(username, newData);
      })
    );
  } catch (error) {
    console.error("Error on handling bought collectibles: ", error);
    return false;
  }

  try {
    await tradeDocRef.ref.update({
      boughtCollectibles: FieldValue.delete(),
    });
    return true;
  } catch (error) {
    console.error("Error on handling bought collectibles: ", error);
    return false;
  }
}

async function addDocToBoughtCollectiblesCollection(
  username: string,
  boughtCollectibleDocData: BoughtCollectibleDocData
) {
  try {
    const boughtCollectiblesCollectibleRef = firestore.collection(
      `users/${username}/collectible/trade/boughtCollectibles`
    );

    await boughtCollectiblesCollectibleRef.add(boughtCollectibleDocData);
    return true;
  } catch (error) {
    console.error(
      "Error on adding doc to bought collectibles collection: ",
      error
    );
    return false;
  }
}

async function handleCreatedCollectibles(
  data: CollectibleTradeDocData,
  username: string,
  tradeDocRef: FirebaseFirestore.DocumentSnapshot<
    FirebaseFirestore.DocumentData,
    FirebaseFirestore.DocumentData
  >
) {
  try {
    await Promise.all(
      data.createdCollectibles.map((c) => {
        const newData: CreatedCollectibleDocData = {
          collectibleDocPath: c.collectibleDocPath,
          postDocPath: c.postDocPath,
          ts: c.ts,
        };
        addDocToCreatedCollectiblesCollection(username, newData);
      })
    );
  } catch (error) {
    console.error("Error on handling created collectibles: ", error);
    return false;
  }

  try {
    await tradeDocRef.ref.update({
      createdCollectibles: FieldValue.delete(),
    });
    return true;
  } catch (error) {
    console.error("Error on handling created collectibles: ", error);
    return false;
  }
}

async function addDocToCreatedCollectiblesCollection(
  username: string,
  createdCollectibleDocData: CreatedCollectibleDocData
) {
  try {
    const createdCollectiblesCollectibleRef = firestore.collection(
      `users/${username}/collectible/trade/createdCollectibles`
    );

    await createdCollectiblesCollectibleRef.add(createdCollectibleDocData);
    return true;
  } catch (error) {
    console.error(
      "Error on adding doc to created collectibles collection: ",
      error
    );
    return false;
  }
}

async function handleSoldCollectibles(
  data: CollectibleTradeDocData,
  username: string,
  tradeDocRef: FirebaseFirestore.DocumentSnapshot<
    FirebaseFirestore.DocumentData,
    FirebaseFirestore.DocumentData
  >
) {
  try {
    await Promise.all(
      data.soldCollectibles.map((s) => {
        const newData: SoldCollectibleDocData = {
          collectibleDocPath: s.collectibleDocPath,
          postDocPath: s.postDocPath,
          ts: s.ts,
          username: s.username,
        };
        addDocToSoldCollectiblesCollection(username, newData);
      })
    );
  } catch (error) {
    console.error("Error on handling sold collectibles: ", error);
    return false;
  }

  try {
    await tradeDocRef.ref.update({
      soldCollectibles: FieldValue.delete(),
    });
    return true;
  } catch (error) {
    console.error("Error on handling created collectibles: ", error);
    return false;
  }
}

async function addDocToSoldCollectiblesCollection(
  username: string,
  soldCollectibleDocData: SoldCollectibleDocData
) {
  try {
    const soldCollectiblesCollectibleRef = firestore.collection(
      `users/${username}/collectible/trade/soldCollectibles`
    );

    await soldCollectiblesCollectibleRef.add(soldCollectibleDocData);
    return true;
  } catch (error) {
    console.error(
      "Error on adding doc to sold collectibles collection: ",
      error
    );
    return false;
  }
}

export const convertCollectibles = onRequest(async (req, res) => {
  const authorized = handleAuthorization(req.headers.authorization);
  if (!authorized) {
    res.status(401).json({error: "Unauthorized"});
    return;
  }

  const allUsers = await getAllUsers();
  if (!allUsers) {
    res.status(500).send("Internal Server Error");
    return;
  }
  const convertAllUsersResult = await convertAllUsers(allUsers);
  if (!convertAllUsersResult) {
    res.status(500).send("Internal Server Error");
    return;
  }
  res.status(200).send("OK");
});
