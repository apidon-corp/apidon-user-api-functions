import {onRequest} from "firebase-functions/v2/https";

import {keys} from "../../../config";

import {
  PaymentIntentDocData,
  PaymentIntentDocDataUpdateable,

  SoldNFTsArrayObject,
  BoughtNFTsArrayObject} from "../../../types/Trade";

import Stripe from "stripe";
const stripe = new Stripe(keys.STRIPE_SECRET_KEY);

import {firestore} from "../../../firebase/adminApp";
import {PostServerDataV3} from "../../../types/Post";
import {BuyersArrayObject, NftDocDataInServer} from "../../../types/NFT";
import {FieldValue} from "firebase-admin/firestore";

function handleAuthorization(key: string | undefined) {
  if (key === undefined) {
    console.error("Unauthorized attemp to successOnPayment API.");
    return false;
  }

  return key === keys.SUCCESS_ON_PAYMENT_API_KEY;
}

function checkProps(paymentIntentId: string) {
  if (!paymentIntentId) {
    console.error("paymentIntentId is undefined.");
    return false;
  }
  return true;
}

async function getPaymentIntentData(paymentIntentId: string) {
  try {
    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
    return paymentIntent;
  } catch (error) {
    console.error(
      "Error while retrieving payment intent from stripe servers: \n",
      error
    );
    return false;
  }
}

async function getCustomerApidonUsername(customerId: string) {
  try {
    const customer = await stripe.customers.retrieve(customerId);
    if (customer.deleted) {
      console.error("NEED-TO-REFUND");
      console.error("Customer was deleted.");
      return false;
    }

    if (!customer.name) {
      console.error("Customer name is undefined.");
      console.error("NEED-TO-REFUND");
      return false;
    }

    return customer.name;
  } catch (error) {
    console.error(
      "Error while retrieving customer from stripe servers: \n",
      error
    );
    return false;
  }
}

async function updatePaymentIntentDataOnUserDocs(
  username: string,
  paymentIntentId: string
) {
  const updateData: PaymentIntentDocDataUpdateable = {
    success: true,
  };

  try {
    const paymentIntentDocRef = firestore.doc(
      `users/${username}/nftTrade/nftTrade/paymentIntents/${paymentIntentId}`
    );

    await paymentIntentDocRef.update(updateData);

    return true;
  } catch (error) {
    console.error(
      "Error while updating payment intent data on user docs: \n",
      error
    );
    console.error("NEED-TO-REFUND");
    return false;
  }
}

async function getPostDocPath(username: string, paymentIntentId: string) {
  try {
    const paymentIntentSnapshot = await firestore
      .doc(
        `users/${username}/nftTrade/nftTrade/paymentIntents/${paymentIntentId}`
      )
      .get();

    if (!paymentIntentSnapshot.exists) {
      console.error(
        "Payment intent does not exist on user's paymentIntents collection."
      );
      return false;
    }

    const paymentIntentDocData =
      paymentIntentSnapshot.data() as PaymentIntentDocData;

    if (!paymentIntentDocData) {
      console.error("Payment intent doc data is undefined.");
      return false;
    }

    if (!paymentIntentDocData.success) {
      console.error("Payment intent is not successful to continue.");
      return false;
    }

    return paymentIntentDocData.postDocPath;
  } catch (error) {
    console.error(
      "Error while retrieving post doc path from payment intent doc: \n",
      error
    );
    return false;
  }
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

function getNftDocPath(postDocData: PostServerDataV3) {
  if (!postDocData.nftStatus.convertedToNft) {
    console.error("NFT is not converted to NFT.");
    return false;
  }

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

function checkNftData(nftData: NftDocDataInServer) {
  if (!nftData.listStatus.isListed) {
    console.error("NFT is not listed.");
    return false;
  }

  if (!nftData.listStatus.stock) {
    console.error("NFT list status stock is undefined.");
    return false;
  }

  if (nftData.listStatus.stock.remainingStock <= 0) {
    console.error("NFT is out of stock.");
    return false;
  }

  return true;
}

async function updateNftDoc(nftDocPath: string, username: string) {
  try {
    const nftDocRef = firestore.doc(nftDocPath);

    const newBuyerObject: BuyersArrayObject = {
      ts: Date.now(),
      username: username,
    };

    await nftDocRef.update({
      "listStatus.buyers": FieldValue.arrayUnion(newBuyerObject),
      "listStatus.stock.remainingStock": FieldValue.increment(-1),
    });

    return true;
  } catch (error) {
    console.error("Error while updating nft doc", error);
    console.error("NEED-TO-REFUND");
    return false;
  }
}

async function updateNftTradeDocOfBuyer(
  postDocPath: string,
  nftDocPath: string,
  username: string
) {
  try {
    const nftTradeDocRef = firestore.doc(`users/${username}/nftTrade/nftTrade`);

    const newBoughtObject: BoughtNFTsArrayObject = {
      nftDocPath: nftDocPath,
      postDocPath: postDocPath,
      ts: Date.now(),
    };

    await nftTradeDocRef.update({
      boughtNFTs: FieldValue.arrayUnion(newBoughtObject),
    });

    return true;
  } catch (error) {
    console.error("Error while updating nft trade doc", error);
    console.error("NEED-TO-REFUND");
    return false;
  }
}

async function updateNftTradeDocOfSeller(
  postDocPath: string,
  nftDocPath: string,
  customer: string,
  sellerUsername: string
) {
  try {
    const nftTradeDocRef = firestore.doc(
      `users/${sellerUsername}/nftTrade/nftTrade`
    );

    const newSoldObject: SoldNFTsArrayObject = {
      nftDocPath: nftDocPath,
      postDocPath: postDocPath,
      ts: Date.now(),
      username: customer,
    };

    await nftTradeDocRef.update({
      soldNFTs: FieldValue.arrayUnion(newSoldObject),
    });

    return true;
  } catch (error) {
    console.error("Error while updating nft trade doc", error);
    console.error("NEED-TO-REFUND");
    return false;
  }
}

export const successOnPayment = onRequest(async (req, res) => {
  const {authorization} = req.headers;
  const {paymentIntentId} = req.body;

  const authResult = handleAuthorization(authorization);
  if (!authResult) {
    res.status(401).send("Unauthorized");
    return;
  }

  const checkPropsResult = checkProps(paymentIntentId);
  if (!checkPropsResult) {
    res.status(422).send("Invalid Request");
    return;
  }

  const paymentIntent = await getPaymentIntentData(paymentIntentId);
  if (!paymentIntent) {
    res.status(500).send("Internal Server Error");
    return;
  }

  const customer = await getCustomerApidonUsername(
    paymentIntent.customer as string
  );
  if (!customer) {
    res.status(500).send("Internal Server Error");
    return;
  }

  const updatePaymentIntentDataOnUserDocsResult =
    await updatePaymentIntentDataOnUserDocs(customer, paymentIntentId);

  if (!updatePaymentIntentDataOnUserDocsResult) {
    res.status(500).send("Internal Server Error");
    return;
  }

  const postDocPath = await getPostDocPath(customer, paymentIntentId);
  if (!postDocPath) {
    res.status(500).send("Internal Server Error");
    return;
  }

  const postData = await getPostData(postDocPath);
  if (!postData) {
    res.status(500).send("Internal Server Error");
    return;
  }

  const nftDocPath = getNftDocPath(postData);
  if (!nftDocPath) {
    res.status(500).send("Internal Server Error");
    return;
  }

  const nftData = await getNftData(nftDocPath);
  if (!nftData) {
    res.status(500).send("Internal Server Error");
    return;
  }

  const nftCheckResult = checkNftData(nftData);
  if (!nftCheckResult) {
    res.status(500).send("Internal Server Error");
    return;
  }

  const updateNftDocResult = await updateNftDoc(nftDocPath, customer);
  if (!updateNftDocResult) {
    res.status(500).send("Internal Server Error");
    return;
  }

  const updateNftTradeDocOfBuyerResult = await updateNftTradeDocOfBuyer(
    postDocPath,
    nftDocPath,
    customer
  );
  if (!updateNftTradeDocOfBuyerResult) {
    res.status(500).send("Internal Server Error");
    return;
  }

  const updateNftTradeDocOfSellerResult = await updateNftTradeDocOfSeller(
    postDocPath,
    nftDocPath,
    customer,
    postData.senderUsername
  );
  if (!updateNftTradeDocOfSellerResult) {
    res.status(500).send("Internal Server Error");
    return;
  }

  res.status(200).send("Successsfull paymaent handled correctly.");
  return;
});
