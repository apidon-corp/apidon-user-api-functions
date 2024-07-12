import { onRequest } from "firebase-functions/v2/https";
import getDisplayName from "../../helpers/getDisplayName";
import { bucket, firestore } from "../../firebase/adminApp";
import { PostServerDataV3 } from "../../types/Post";
import { NftDocDataInServer, NFTMetadata } from "../../types/NFT";

import { apidonNFT } from "../../helpers/web3/nft/apidonNFTApp";
import { TransactionReceipt } from "ethers";
import { keys } from "../../config";

import { FieldValue as fieldValue } from "firebase-admin/firestore";

import { appCheckMiddleware } from "../../middleware/appCheckMiddleware";

async function handleAuthorization(key: string | undefined) {
  if (key === undefined) {
    console.error("Unauthorized attemp to sendReply API.");
    return false;
  }

  const operationFromUsername = await getDisplayName(key);
  if (!operationFromUsername) return false;

  return operationFromUsername;
}

function checkProps(postDocPath: string, title: string, description: string) {
  if (!postDocPath) return false;
  if (!title && !description) return false;
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

function createNFTMetadataObject(postDocData: PostServerDataV3, title: string) {
  const metadata: NFTMetadata = {
    name: title || `${postDocData.senderUsername}'s NFT`,
    description: postDocData.description,

    image: postDocData.image,
    attributes: [
      {
        display_type: "date",
        trait_type: "Post Creation",
        value: postDocData.creationTime,
      },
      {
        display_type: "date",
        trait_type: "NFT Creation",
        value: Date.now(),
      },
      {
        trait_type: "Rating",
        value:
          postDocData.rates.reduce((acc, current) => acc + current.rate, 0) /
          postDocData.rates.length
            ? postDocData.rates.length
            : 1,
      },
      {
        trait_type: "Comments",
        value: postDocData.comments.length,
      },
      {
        trait_type: "SENDER",
        value: postDocData.senderUsername,
      },
    ],
  };
  return metadata;
}

function checkPostForNFT(postDocData: PostServerDataV3) {
  if (postDocData.nftStatus.convertedToNft) {
    console.error("Post is already converted to NFT.");
    return false;
  }

  return true;
}

async function uploadNFTMetadata(
  metadata: NFTMetadata,
  postDocData: PostServerDataV3
) {
  try {
    const data = Buffer.from(JSON.stringify(metadata));

    const file = bucket.file(
      `users/${postDocData.senderUsername}/postFiles/${postDocData.id}/nftMetadata`
    );

    await file.save(data, {
      metadata: {
        contentType: "application/json",
      },
    });

    await file.makePublic();

    return file.publicUrl();
  } catch (error) {
    console.error("Error while uploading NFT metadata", error);
    return false;
  }
}

async function mintNFT(metadataURL: string) {
  try {
    const transaction = await apidonNFT.mint(metadataURL);
    return transaction;
  } catch (error) {
    console.error("Error while minting NFT", error);
    return false;
  }
}

async function createTransactionReceipt(
  transaction: any,
  verificationBlockCount = 1
) {
  try {
    const transactionReceipt = (await transaction.wait(
      verificationBlockCount
    )) as TransactionReceipt;

    if (!transactionReceipt) {
      console.error("Transaction receipt is null");
      return false;
    }

    return transactionReceipt;
  } catch (error) {
    console.error("Error while waiting verifications", error);
    return false;
  }
}

function getTokenId(transactionReceipt: TransactionReceipt) {
  return parseInt(transactionReceipt.logs[0].topics[3], 16);
}

function createOpenseaLink(tokenId: number) {
  return `https://testnets.opensea.io/assets/sepolia/${keys.APIDON_NFT_CONTRACT_ADDRESS}/${tokenId}`;
}

async function updateUserDoc(username: string) {
  try {
    const userDocRef = firestore.doc(`users/${username}`);
    await userDocRef.update({
      nftCount: fieldValue.increment(1),
    });
    return true;
  } catch (error) {
    console.error(
      "Error while updating user doc on incrementing nftCount",
      error
    );
    return false;
  }
}

async function createNFTDoc(
  metadata: NFTMetadata,
  metadaataLink: string,
  postDocPath: string,
  tokenId: number,
  openseaUrl: string
) {
  const data: NftDocDataInServer = {
    contractAddress: keys.APIDON_NFT_CONTRACT_ADDRESS,
    description: metadata.description,
    listStatus: {
      isListed: false,
    },
    metadataLink: metadaataLink,
    mintTime: Date.now(),
    name: metadata.name,
    openseaUrl: openseaUrl,
    postDocPath: postDocPath,
    tokenId: tokenId,
    transferStatus: { isTransferred: false },
  };

  try {
    const nftDoc = await firestore.collection("/nfts").add({ ...data });
    return nftDoc.path;
  } catch (error) {
    console.error("Error while creating NFT doc", error);
    return false;
  }
}

async function updatePostDoc(postDocPath: string, nftDocPath: string) {
  try {
    const postDocRef = firestore.doc(postDocPath);

    await postDocRef.update({
      nftStatus: {
        convertedToNft: true,
        nftDocPath: nftDocPath,
      },
    });
    return true;
  } catch (error) {
    console.error("Error while updating post doc", error);
    return false;
  }
}

export const uploadNFT = onRequest(
  appCheckMiddleware(async (req, res) => {
    const { authorization } = req.headers;
    const { postDocPath, title, description } = req.body;

    const username = await handleAuthorization(authorization);
    if (!username) {
      res.status(401).send("Unauthorized");
      return;
    }

    const checkPropsResult = checkProps(postDocPath, title, description);
    if (!checkPropsResult) {
      res.status(422).send("Invalid Request");
      return;
    }

    const postData = await getPostData(postDocPath);
    if (!postData) {
      res.status(422).send("Invalid Request");
      return;
    }

    const validForNFTConversion = checkPostForNFT(postData);
    if (!validForNFTConversion) {
      res.status(422).send("Invalid Request");
      return;
    }

    const metadata = createNFTMetadataObject(postData, title);

    const metadataURL = await uploadNFTMetadata(metadata, postData);
    if (!metadataURL) {
      res.status(500).send("Internal Server Error");
      return;
    }

    const transaction = await mintNFT(metadataURL);
    if (!transaction) {
      res.status(500).send("Internal Server Error");
      return;
    }

    const transactionReceipt = await createTransactionReceipt(transaction, 1);
    if (!transactionReceipt) {
      res.status(500).send("Internal Server Error");
      return;
    }

    const tokenId = getTokenId(transactionReceipt);
    const openseaUrl = createOpenseaLink(tokenId);

    const updateUserDocResult = await updateUserDoc(username);
    if (!updateUserDocResult) {
      res.status(500).send("Internal Server Error");
      return;
    }

    const createdNftDocPath = await createNFTDoc(
      metadata,
      metadataURL,
      postDocPath,
      tokenId,
      openseaUrl
    );
    if (!createdNftDocPath) {
      res.status(500).send("Internal Server Error");
      return;
    }

    const updatePostDocResult = await updatePostDoc(
      postDocPath,
      createdNftDocPath
    );
    if (!updatePostDocResult) {
      res.status(500).send("Internal Server Error");
      return;
    }

    res.status(200).json({
      nftDocPath: createdNftDocPath,
    });
    return;
  })
);
