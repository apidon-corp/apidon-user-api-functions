import { onRequest } from "firebase-functions/v2/https";

import { appCheckMiddleware } from "../../middleware/appCheckMiddleware";
import getDisplayName from "../../helpers/getDisplayName";
import { firestore } from "../../firebase/adminApp";
import { PostServerDataV3 } from "../../types/Post";
import { NftDocDataInServer } from "../../types/NFT";
import { internalAPIRoutes, keys } from "../../config";
import { UserInServer } from "../../types/User";

async function handleAuthorization(key: string | undefined) {
  if (key === undefined) {
    console.error("Unauthorized attemp to sendReply API.");
    return false;
  }

  const operationFromUsername = await getDisplayName(key);
  if (!operationFromUsername) return false;

  return operationFromUsername;
}

function checkProps(postDocPath: string) {
  if (!postDocPath) {
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

function getNFTDocPath(postDocData: PostServerDataV3) {
  if (!postDocData.nftStatus.nftDocPath) {
    console.error("NFT doc path is undefined.");
    return false;
  }

  return postDocData.nftStatus.nftDocPath;
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

function checkStockStatus(nftDocData: NftDocDataInServer) {
  if (!nftDocData.listStatus.stock) return false;
  if (nftDocData.listStatus.stock <= 0) return false;

  return true;
}

async function getStripeCustomerId(username: string) {
  try {
    const userDocSnapshot = await firestore.doc(`/users/${username}`).get();

    if (!userDocSnapshot.exists) {
      console.error("User doc does not exist.");
      return false;
    }

    const userDocData = userDocSnapshot.data() as UserInServer;

    if (!userDocData) {
      console.error("User doc data is undefined.");
      return false;
    }

    return userDocData.stripeCustomerId
      ? userDocData.stripeCustomerId
      : undefined;
  } catch (error) {
    console.error("Error while getting stripe customer id", error);
    return false;
  }
}

async function createPaymentOnStripe(
  stripeCustomerId: string | undefined,
  price: number | undefined
) {
  try {
    if (!price) return false;

    const apiKey = keys.CREATE_PAYMENT_API_KEY;
    const response = await fetch(internalAPIRoutes.payment.createPayment, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        authorization: apiKey,
      },
      body: JSON.stringify({
        stripeCustomerId,
        price,
      }),
    });

    if (!response.ok) {
      console.error(
        "Response from createPayment API is not okay: ",
        await response.text()
      );
      return false;
    }

    const {
      paymentIntent,
      ephemeralKey,
      customer,
      publishableKey,
      createdStripeCustomerId,
    } = await response.json();

    if (!paymentIntent || !ephemeralKey || !customer || !publishableKey) {
      console.error(
        "Payment intent, ephemeral key, customer or publishable key is undefined."
      );
      return false;
    }

    return {
      paymentIntent,
      ephemeralKey,
      customer,
      publishableKey,
      createdStripeCustomerId,
    };
  } catch (error) {
    console.error("Error while creating payment on stripe: ", error);
    return false;
  }
}

async function setCustomerId(
  username: string,
  createdStripeCustomerId: string | undefined
) {
  if (!createdStripeCustomerId) return true;

  try {
    await firestore
      .doc(`/users/${username}`)
      .update({ stripeCustomerId: createdStripeCustomerId });

    return true;
  } catch (error) {
    console.error("Error while setting new customer id: \n", error);
    return false;
  }
}

export const buyNFT = onRequest(
  appCheckMiddleware(async (req, res) => {
    const { authorization } = req.headers;
    const { postDocPath } = req.body;

    const username = await handleAuthorization(authorization);
    if (!username) {
      res.status(401).send("Unauthorized");
      return;
    }

    const checkPropsResult = checkProps(postDocPath);
    if (!checkPropsResult) {
      res.status(422).send("Invalid Request");
      return;
    }

    const postData = await getPostData(postDocPath);
    if (!postData) {
      res.status(404).send("Not Found");
      return;
    }

    const nftDocPath = getNFTDocPath(postData);
    if (!nftDocPath) {
      res.status(500).send("Internal Server Error");
      return;
    }

    const nftData = await getNftData(nftDocPath);
    if (!nftData) {
      res.status(500).send("Internal Server Error");
      return;
    }

    const stockStatus = checkStockStatus(nftData);
    if (!stockStatus) {
      res.status(409).send("Conflict");
      return;
    }

    const stripeCustomerId = await getStripeCustomerId(username);
    if (stripeCustomerId === false) {
      res.status(500).send("Internal Server Error");
      return;
    }

    const createStripePaymentResult = await createPaymentOnStripe(
      stripeCustomerId,
      nftData.listStatus.price
    );

    if (!createStripePaymentResult) {
      res.status(500).send("Internal Server Error");
      return;
    }

    const setCustomerIdResult = await setCustomerId(
      username,
      createStripePaymentResult.createdStripeCustomerId
    );
    if (!setCustomerIdResult) {
      res.status(500).send("Internal Server Error");
      return;
    }

    res.status(200).json({
      paymentIntent: createStripePaymentResult.paymentIntent,
      ephemeralKey: createStripePaymentResult.ephemeralKey,
      customer: createStripePaymentResult.customer,
    });

    return;
  })
);
