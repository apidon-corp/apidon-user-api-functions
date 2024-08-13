import {FieldValue} from "firebase-admin/firestore";
import {onRequest} from "firebase-functions/v2/https";
import {firestore} from "../../firebase/adminApp";
import getDisplayName from "../../helpers/getDisplayName";
import {appCheckMiddleware} from "../../middleware/appCheckMiddleware";
import {CollectibleDocData} from "../../types/Collectible";
import {PostServerData} from "../../types/Post";
import {CreatedCollectiblesArrayObject} from "../../types/Trade";

async function handleAuthorization(key: string | undefined) {
  if (key === undefined) {
    console.error("Unauthorized attemp to sendReply API.");
    return false;
  }

  const operationFromUsername = await getDisplayName(key);
  if (!operationFromUsername) return false;

  return operationFromUsername;
}

function checkProps(postDocPath: string, price: number, stock: number) {
  if (!postDocPath || !price || !stock) return false;

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

function checkPostForCollectible(postDocData: PostServerData) {
  if (postDocData.collectibleStatus.isCollectible) {
    console.error("Post already is a collectible");
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
    buyers: [],
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

async function updateTradeDoc(
  username: string,
  collectibleDocPath: string,
  postDocPath: string,
  timestamp: number
) {
  const newCreatedCollectibleArrayObject: CreatedCollectiblesArrayObject = {
    collectibleDocPath: collectibleDocPath,
    postDocPath: postDocPath,
    ts: timestamp,
  };

  try {
    const tradeDocRef = firestore.doc(`users/${username}/collectible/trade`);

    await tradeDocRef.update({
      createdCollectibles: FieldValue.arrayUnion(
        newCreatedCollectibleArrayObject
      ),
    });

    return true;
  } catch (error) {
    console.error("Error while updating trade doc", error);
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

export const createCollectible = onRequest(
  appCheckMiddleware(async (req, res) => {
    const {authorization} = req.headers;
    const {postDocPath, price, stock} = req.body;

    const username = await handleAuthorization(authorization);
    if (!username) {
      res.status(401).send("Unauthorized");
      return;
    }

    const checkPropsResult = checkProps(postDocPath, price, stock);
    if (!checkPropsResult) {
      res.status(422).send("Invalid Request");
      return;
    }

    const postData = await getPostData(postDocPath);
    if (!postData) {
      res.status(422).send("Invalid Request");
      return;
    }
    const canAuthorizedForThisOperationResult =
      checkCanAuthorizedForThisOperation(postData, username);
    if (!canAuthorizedForThisOperationResult) {
      res.status(403).send("Forbidden");
      return;
    }

    const checkPostForCollectibleResult = checkPostForCollectible(postData);
    if (!checkPostForCollectibleResult) {
      res.status(422).send("Invalid Request");
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
      const rollBackResult = await rollBackCollectibleDoc(
        newCollectibleDocPath
      );
      if (!rollBackResult) {
        console.error("Error while roll back collectible doc");
      }
      res.status(500).send("Internal Server Error");
      return;
    }

    const updateTradeDocResult = await updateTradeDoc(
      username,
      newCollectibleDocPath,
      postDocPath,
      timestamp
    );
    if (!updateTradeDocResult) {
      const rollBackResult = await rollBackCollectibleDoc(
        newCollectibleDocPath
      );
      if (!rollBackResult) {
        console.error("Error while roll back collectible doc");
      }
      const rollBackPostDocResult = await rollBackPostDoc(postDocPath);
      if (!rollBackPostDocResult) {
        console.error("Error while roll back post doc");
      }
      res.status(500).send("Internal Server Error");
      return;
    }

    res.status(200).send("OK");
    return;
  })
);