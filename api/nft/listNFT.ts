import { onRequest } from "firebase-functions/v2/https";
import { firestore } from "../../firebase/adminApp";
import getDisplayName from "../../helpers/getDisplayName";
import { appCheckMiddleware } from "../../middleware/appCheckMiddleware";
import { NftDocDataInServer } from "../../types/NFT";
import { PostServerDataV3 } from "../../types/Post";

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
  if (!postDocPath || !price || !stock) {
    console.error("postDocPath or price or stock is undefined.");
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

    const postDocData = postDocSnapshot.data() as PostServerDataV3;
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

function checkCanList(postServerData: PostServerDataV3, username: string) {
  return postServerData.senderUsername === username;
}

function checkAvaliableForListingInitial(postServerData: PostServerDataV3) {
  if (!postServerData.nftStatus.convertedToNft) return false;
  if (!postServerData.nftStatus.nftDocPath) return false;

  return true;
}

async function getNftData(nftDocPath?: string) {
  if (!nftDocPath) return false;

  try {
    const nftDocSnapshot = await firestore.doc(nftDocPath).get();
    if (!nftDocSnapshot.exists) {
      console.error("NFT doc does not exist.");
      return false;
    }

    const nftDocData = nftDocSnapshot.data() as NftDocDataInServer;
    if (!nftDocData) {
      console.error("NFT doc data is undefined.");
      return false;
    }

    return nftDocData;
  } catch (error) {
    console.error("Error while getting nft data", error);
    return false;
  }
}

function checkAlreadyListed(nftData: NftDocDataInServer) {
  if (nftData.listStatus.isListed) {
    console.error("NFT already listed.");
    return true;
  }

  return false;
}

async function updateListStatus(
  price: number,
  stock: number,
  nftDocPath?: string
) {
  if (!nftDocPath) return false;

  const newListObject: NftDocDataInServer["listStatus"] = {
    isListed: true,
    buyers: [],
    price: {
      price: price,
      currency: "USD",
    },
    stock: {
      initialStock: stock,
      remainingStock: stock,
    },
  };

  try {
    const nftDocRef = firestore.doc(nftDocPath);

    await nftDocRef.update({
      listStatus: newListObject,
    });

    return true;
  } catch (error) {
    console.error("Error while updating list status", error);
    return false;
  }
}

export const listNFT = onRequest(
  appCheckMiddleware(async (req, res) => {
    const { authorization } = req.headers;
    const { postDocPath, price, stock } = req.body;

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
      res.status(500).send("Internal Server Error");
      return;
    }

    const canList = checkCanList(postData, username);
    if (!canList) {
      res.status(403).send("Forbidden");
      return;
    }

    const initialAvaliableForListResult =
      checkAvaliableForListingInitial(postData);

    if (!initialAvaliableForListResult) {
      res.status(422).send("Invalid Request");
      return;
    }

    const nftData = await getNftData(postData.nftStatus.nftDocPath);
    if (!nftData) {
      res.status(500).send("Internal Server Error");
      return;
    }

    const alreadyListed = checkAlreadyListed(nftData);
    if (alreadyListed) {
      res.status(409).send("Conflict");
      return;
    }

    const updateListStatusResult = await updateListStatus(
      price,
      stock,
      postData.nftStatus.nftDocPath
    );
    if (!updateListStatusResult) {
      res.status(500).send("Internal Server Error");
      return;
    }

    res.status(200).send({
      message: "NFT listed successfully.",
    });
    return;
  })
);
