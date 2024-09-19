import {onRequest} from "firebase-functions/v2/https";
import {firestore} from "../../firebase/adminApp";
import {
  CollectibleDocDataOld,
  CollectorDocData,
} from "../../types/Collectible";
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

async function getAllCollectibles() {
  try {
    const query = await firestore.collection("/collectibles").get();

    const collectibles: CollectibleDocDataOld[] = [];

    for (const doc of query.docs) {
      const data = doc.data() as CollectibleDocDataOld;
      collectibles.push(data);
    }

    return collectibles;
  } catch (error) {
    console.error("Error getting collectibles:", error);
    return false;
  }
}

async function addCollectorDocToCollectorsCollection(
  collectibleId: string,
  collectorDocData: CollectorDocData
) {
  try {
    await firestore
      .collection(`/collectibles/${collectibleId}/collectors`)
      .add(collectorDocData);
    return true;
  } catch (error) {
    console.error(
      "Error adding collector doc to collectors collection:",
      error
    );
    return false;
  }
}

async function convertOneCollectible(
  collectibleDocData: CollectibleDocDataOld
) {
  const buyers = collectibleDocData.buyers;

  for (const buyer of buyers) {
    const newCollectorDocData: CollectorDocData = {
      username: buyer.username,
      timestamp: buyer.ts,
    };

    await addCollectorDocToCollectorsCollection(
      collectibleDocData.id,
      newCollectorDocData
    );
  }

  try {
    await firestore.doc(`/collectibles/${collectibleDocData.id}`).update({
      buyers: FieldValue.delete(),
    });
    return true;
  } catch (error) {
    console.error("Error converting collectible:", error);
    return false;
  }
}

async function covnertAllCollectibles(collectibles: CollectibleDocDataOld[]) {
  try {
    const results = await Promise.all(collectibles.map(convertOneCollectible));
    return results.every((result) => result);
  } catch (error) {
    console.error("Error converting all collectibles:", error);
    return false;
  }
}

export const convertCollectors = onRequest(async (req, res) => {
  const authorized = handleAuthorization(req.headers.authorization);
  if (!authorized) {
    res.status(401).json({error: "Unauthorized"});
    return;
  }

  const collectibles = await getAllCollectibles();

  if (!collectibles) {
    console.error("Error getting collectibles");
    res.status(500).json({error: "Error getting collectibles"});
    return;
  }

  const result = await covnertAllCollectibles(collectibles);
  if (!result) {
    console.error("Error converting collectibles");
    res.status(500).json({error: "Error converting collectibles"});
    return;
  }

  res.status(200).json({message: "Collectibles converted successfully"});
  return;
});
