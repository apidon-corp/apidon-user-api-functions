import {TopUpPlansConfigDocData} from "@/types/IAP";
import {UserInServer} from "@/types/User";
import {onRequest} from "firebase-functions/v2/https";
import {firestore} from "../../firebase/adminApp";
import getDisplayName from "../../helpers/getDisplayName";
import {appCheckMiddleware} from "../../middleware/appCheckMiddleware";
import {CollectibleDocData} from "../../types/Collectible";
import {PostServerData} from "../../types/Post";
import {CreatedCollectibleDocData} from "../../types/Trade";
import {CollectibleConfigDocData} from "@/types/Config";
import {FieldValue} from "firebase-admin/firestore";

async function handleAuthorization(key: string | undefined) {
  if (key === undefined) {
    console.error("Unauthorized attemp to sendReply API.");
    return false;
  }

  const operationFromUsername = await getDisplayName(key);
  if (!operationFromUsername) return false;

  return operationFromUsername;
}

async function checkForIAPLikePrice(priceInInt: number) {
  try {
    const topUpPlansConfigSnapshot = await firestore
      .doc("topUpPlans/config")
      .get();

    if (!topUpPlansConfigSnapshot.exists) {
      console.error("Top up plans config does not exist.");
      return false;
    }

    const data = topUpPlansConfigSnapshot.data() as TopUpPlansConfigDocData;

    if (!data) {
      console.error("Top up plans config data is undefined.");
      return false;
    }

    const activeTopUpProductIdS = data.activeTopUpProductIdS;

    const validPrices = activeTopUpProductIdS.map((id) => {
      // Format of top up product item is like: "1_dollar_in_app_credit"
      // We need to get first element of this string

      const price = id.split("_")[0];

      const priceInt = parseInt(price);

      if (!isNaN(priceInt)) {
        return priceInt;
      } else {
        console.error(`Invalid price format: ${id}`);
        return 0;
      }
    });

    if (!validPrices.includes(priceInInt)) {
      console.error("Invalid price");
      return false;
    }
    return true;
  } catch (error) {
    console.error("Error while checking top up plans config", error);
    return false;
  }
}

async function checkProps(postDocPath: string, price: number, stock: number) {
  if (!postDocPath || !price || !stock) return false;

  const priceInInt = parseInt(price.toString());

  if (isNaN(priceInInt)) {
    console.error("Price is not a number");
    return false;
  }

  if (priceInInt <= 0) {
    console.error("Price must be greater than 0");
    return false;
  }

  // We need to also check if price is IAP-like
  const isIAPLikePrice = await checkForIAPLikePrice(price);
  if (!isIAPLikePrice) {
    return false;
  }

  const stockInt = parseInt(stock.toString());
  if (isNaN(stockInt)) {
    console.error("Stock is not a number");
    return false;
  }

  if (stockInt <= 0) {
    console.error("Stock must be greater than 0");
    return false;
  }

  return true;
}

async function getPostData(postDocPath: string) {
  try {
    const postDocSnapshot = await firestore.doc(postDocPath).get();
    if (!postDocSnapshot.exists) {
      console.error("Post doc does not exist.");
      return false;
    }

    const postDocData = postDocSnapshot.data() as PostServerData;
    if (!postDocData) {
      console.error("Post doc data is undefined.");
      return false;
    }

    return postDocData;
  } catch (error) {
    console.error("Error while getting post data", error);
    return false;
  }
}

function checkCanAuthorizedForThisOperation(
  postDocData: PostServerData,
  username: string
) {
  if (postDocData.senderUsername !== username) {
    console.error("Unauthorized attemp.");
    return false;
  }

  return true;
}

/**
 * Checking for if user has purple thick.
 */
async function checkIsVerified(username: string) {
  try {
    const userDocSnapshot = await firestore.doc(`users/${username}`).get();

    if (!userDocSnapshot.exists) {
      console.error("User doc does not exist");
      return false;
    }

    const data = userDocSnapshot.data() as UserInServer;

    if (!data) {
      console.error("User doc data is undefined");
      return false;
    }

    return data.verified;
  } catch (error) {
    console.error("Error while checking user verification", error);
    return false;
  }
}

function checkPostForCollectible(postDocData: PostServerData) {
  if (postDocData.collectibleStatus.isCollectible) {
    console.error("Post already is a collectible");
    return false;
  }

  return true;
}

async function getStockLimit() {
  try {
    const collectibleDoc = await firestore.doc("config/collectible").get();

    if (!collectibleDoc.exists) {
      console.error("Collectible config doc does not exist");
      return false;
    }

    const data = collectibleDoc.data() as CollectibleConfigDocData;

    if (!data) {
      console.error("Collectible config doc data is undefined");
      return false;
    }

    return data.stockLimit;
  } catch (error) {
    console.error("Error while getting stock limit", error);
    return false;
  }
}

function checkStock(requestedStock: number, stockLimit: number) {
  if (requestedStock > stockLimit) {
    console.error("Stock limit exceeded");
    return false;
  }

  return true;
}

async function createCollectibleDoc(
  postDocPath: string,
  timestamp: number,
  username: string,
  price: number,
  stock: number
) {
  const newId = username + "-" + timestamp.toString();

  const priceInInt = parseInt(price.toString());
  if (isNaN(priceInInt)) {
    console.error("Price is not a number");
    return false;
  }

  const stockInt = parseInt(stock.toString());
  if (isNaN(stockInt)) {
    console.error("Stock is not a number");
    return false;
  }

  const newCollectibleData: CollectibleDocData = {
    postDocPath: postDocPath,
    creator: username,
    id: newId,
    price: {
      price: priceInInt,
      currency: "USD",
    },
    stock: {
      initialStock: stock,
      remainingStock: stock,
    },
    timestamp: timestamp,
    type: "trade",
  };

  try {
    await firestore.doc(`/collectibles/${newId}`).set(newCollectibleData);
    return newId;
  } catch (error) {
    console.error("Error while creating NFT doc", error);
    return false;
  }
}

async function updatePostDoc(postDocPath: string, collectibleDocPath: string) {
  try {
    const postDocRef = firestore.doc(postDocPath);

    await postDocRef.update({
      collectibleStatus: {
        isCollectible: true,
        collectibleDocPath: collectibleDocPath,
      },
    });
    return true;
  } catch (error) {
    console.error("Error while updating post doc", error);
    return false;
  }
}

async function rollBackCollectibleDoc(collectibleDocPath: string) {
  try {
    const collectibleDocRef = firestore.doc(collectibleDocPath);
    await collectibleDocRef.delete();
    return true;
  } catch (error) {
    console.error("Error while roll back collectible doc", error);
    return false;
  }
}

async function addDocToCreatedCollectibles(
  collectibleDocPath: string,
  postDocPath: string,
  ts: number,
  creator: string
) {
  const newData: CreatedCollectibleDocData = {
    collectibleDocPath: collectibleDocPath,
    postDocPath: postDocPath,
    ts: ts,
  };

  try {
    const collectionRef = firestore.collection(
      `users/${creator}/collectible/trade/createdCollectibles`
    );
    const {path} = await collectionRef.add(newData);
    return path;
  } catch (error) {
    console.error("Error while adding doc to created collectibles", error);
    return false;
  }
}

async function rollBackPostDoc(postDocPath: string) {
  try {
    const postDocRef = firestore.doc(postDocPath);
    await postDocRef.update({
      collectibleStatus: {
        isCollectible: false,
      },
    });
    return true;
  } catch (error) {
    console.error("Error while roll back post doc", error);
    return false;
  }
}

async function updateUserCollectibleCount(
  username: string,
  isRollback?: boolean
) {
  try {
    const userDocRef = firestore.doc(`users/${username}`);

    await userDocRef.update({
      collectibleCount: FieldValue.increment(isRollback ? -1 : 1),
    });

    return true;
  } catch (error) {
    console.error("Error while updating user collectible count", error);
    return false;
  }
}

async function rollBackAddDocToCreatedCollectibles(path: string) {
  try {
    const collectibleDocRef = firestore.doc(path);
    await collectibleDocRef.delete();
    return true;
  } catch (error) {
    console.error(
      "Error while roll back add doc to created collectibles",
      error
    );
    return false;
  }
}

export const createCollectible = onRequest(
  appCheckMiddleware(async (req, res) => {
    const {authorization} = req.headers;
    const {postDocPath, price, stock} = req.body;

    const username = await handleAuthorization(authorization);
    if (!username) {
      res.status(401).send("Unauthorized");
      return;
    }

    const checkPropsResult = await checkProps(postDocPath, price, stock);
    if (!checkPropsResult) {
      res.status(422).send("Invalid Request");
      return;
    }

    const postData = await getPostData(postDocPath);
    if (!postData) {
      res.status(422).send("Invalid Request");
      return;
    }

    const isAuthorizedForThisOperation = checkCanAuthorizedForThisOperation(
      postData,
      username
    );
    if (!isAuthorizedForThisOperation) {
      res.status(403).send("Forbidden");
      return;
    }

    const isVerified = await checkIsVerified(username);
    if (!isVerified) {
      res.status(403).send("Forbidden");
      return;
    }

    const checkPostForCollectibleResult = checkPostForCollectible(postData);
    if (!checkPostForCollectibleResult) {
      res.status(422).send("Invalid Request");
      return;
    }

    const stockLimit = await getStockLimit();
    if (stockLimit === false) {
      res.status(500).send("Internal Server Error");
      return;
    }

    const checkStockResult = checkStock(stock, stockLimit);
    if (!checkStockResult) {
      res.status(403).send("Forbidden");
      return;
    }

    const timestamp = Date.now();
    const newCollectibleId = await createCollectibleDoc(
      postDocPath,
      timestamp,
      username,
      price,
      stock
    );
    if (!newCollectibleId) {
      res.status(500).send("Internal Server Error");
      return;
    }

    const newCollectibleDocPath = `collectibles/${newCollectibleId}`;
    const updatePostDocResult = await updatePostDoc(
      postDocPath,
      newCollectibleDocPath
    );
    if (!updatePostDocResult) {
      await rollBackCollectibleDoc(newCollectibleDocPath);
      res.status(500).send("Internal Server Error");
      return;
    }

    const addDocToCreatedCollectiblesResult = await addDocToCreatedCollectibles(
      newCollectibleDocPath,
      postDocPath,
      timestamp,
      username
    );
    if (!addDocToCreatedCollectiblesResult) {
      await rollBackCollectibleDoc(newCollectibleDocPath);
      await rollBackPostDoc(postDocPath);
      res.status(500).send("Internal Server Error");
      return;
    }

    const updateUserCollectibleCountResult = await updateUserCollectibleCount(
      username
    );
    if (!updateUserCollectibleCountResult) {
      await rollBackCollectibleDoc(newCollectibleDocPath);
      await rollBackPostDoc(postDocPath);
      await rollBackAddDocToCreatedCollectibles(
        addDocToCreatedCollectiblesResult
      );
      res.status(500).send("Internal Server Error");
      return;
    }

    res.status(200).send("OK");
    return;
  })
);
