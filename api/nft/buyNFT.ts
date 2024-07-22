import {onRequest} from "firebase-functions/v2/https";

import {
  BoughtNFTsArrayObject,
  PurhcasePaymentIntentDocData,
  SellPaymentIntentDocData,
  SoldNFTsArrayObject,
} from "../../types/Trade";

import {FieldValue} from "firebase-admin/firestore";
import {firestore} from "../../firebase/adminApp";
import {BuyersArrayObject, NftDocDataInServer} from "../../types/NFT";
import {PostServerDataV3} from "../../types/Post";

import getDisplayName from "../../helpers/getDisplayName";
import {BalanceDocData} from "@/types/Wallet";
import {appCheckMiddleware} from "../../middleware/appCheckMiddleware";

/**
 * Handles the authorization by verifying the provided key.
 * @param authorization - The authorization key.
 * @returns The username if authorized, otherwise false.
 */
async function handleAuthorization(authorization: string | undefined) {
  if (authorization === undefined) {
    console.error("Unauthorized attemp to sendReply API.");
    return false;
  }

  const operationFromUsername = await getDisplayName(authorization);
  if (!operationFromUsername) return false;

  return operationFromUsername;
}

/**
 * Checks the validity of the provided postDocPath.
 * @param postDocPath - The document path of the post.
 * @returns True if valid, otherwise false.
 */
function checkProps(postDocPath: string) {
  if (!postDocPath) {
    console.error("postDocPath is undefined.");
    return false;
  }
  return true;
}

/**
 * Retrieves the post data from Firestore.
 * @param postDocPath - The document path of the post.
 * @returns The post data if found, otherwise false.
 */
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

function isDifferentPersonThanCreator(
  postDocData: PostServerDataV3,
  customer: string
) {
  return postDocData.senderUsername !== customer;
}

/**
 * Retrieves the NFT document path from the post data.
 * @param postDocData - The post data.
 * @returns The NFT document path if valid, otherwise false.
 */
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

/**
 * Retrieves the NFT data from Firestore.
 * @param nftDocPath - The document path of the NFT.
 * @returns The NFT data if found, otherwise false.
 */
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

/**
 * Checks the validity of the NFT data.
 * @param nftData - The NFT data.
 * @returns True if valid, otherwise false.
 */
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

function checkPurchasingSingleTime(
  nftData: NftDocDataInServer,
  customer: string
) {
  if (!nftData.listStatus.isListed) return false;

  const buyersUsernames = nftData.listStatus.buyers.map((b) => b.username);

  const alreadyBought = buyersUsernames.includes(customer);

  if (alreadyBought) {
    console.error("Customer has already bought NFT.");
    return false;
  }

  return true;
}

/**
 * Retrieves the price of the NFT.
 * @param nftData - The NFT data.
 * @returns The price if valid, otherwise false.
 */
function getPrice(nftData: NftDocDataInServer) {
  if (!nftData.listStatus.isListed) {
    console.error("NFT is not listed.");
    return false;
  }

  if (!nftData.listStatus.price) {
    console.error("NFT price is undefined.");
    return false;
  }

  return nftData.listStatus.price;
}

/**
 * Retrieves the balance of the user.
 * @param username - The username of the user.
 * @returns The balance if found, otherwise false.
 */
async function getBalance(username: string) {
  try {
    const balanceDocSnapshot = await firestore
      .doc(`users/${username}/wallet/balance`)
      .get();

    if (!balanceDocSnapshot.exists) {
      console.error("Balance doc does not exist");
      return false;
    }

    const balancdeDocData = balanceDocSnapshot.data() as BalanceDocData;

    if (!balancdeDocData) {
      console.error("Balance doc data is undefined");
      return false;
    }

    const balance = balancdeDocData.balance;

    return balance;
  } catch (error) {
    console.error("Error while getting balance", error);
    return false;
  }
}

/**
 * Checks if the user has enough money for the transaction.
 * @param balance - The user's balance.
 * @param price - The price of the NFT.
 * @returns True if the user has enough money, otherwise false.
 */
function hasMoney(balance: number, price: number) {
  if (balance < price) {
    console.error("Not enough money to do this operation.");
    return false;
  }

  return true;
}

// Checking finished.

/**
 * Updates the balance of the user.
 * @param username - The username of the user.
 * @param price - The price of the NFT.
 * @returns The updated balance if successful, otherwise false.
 */
async function updateBalance(username: string, price: number) {
  try {
    const balanceDocRef = firestore.doc(`users/${username}/wallet/balance`);

    await balanceDocRef.update({
      balance: FieldValue.increment(-price),
    });

    return price;
  } catch (error) {
    console.error("Error while updating balance", error);
    return false;
  }
}

/**
 * Updates the balance of the seller.
 * @param seller - The username of the seller.
 * @param price - The price of the NFT.
 * @returns The updated balance if successful, otherwise false.
 */
async function updateBalanceOfSeller(seller: string, price: number) {
  try {
    const balanceDocRef = firestore.doc(`users/${seller}/wallet/balance`);

    await balanceDocRef.update({
      balance: FieldValue.increment(price),
    });

    return price;
  } catch (error) {
    console.error("Error while updating seller balance", error);
    return false;
  }
}

/**
 * Creates a purchase payment intent document.
 * @param username - The username of the customer.
 * @param ts - The timestamp of the transaction.
 * @param postDocPath - The document path of the post.
 * @param nftDocPath - The document path of the NFT.
 * @param price - The price of the NFT.
 * @param seller - The username of the seller.
 * @param customer - The username of the customer.
 * @returns The ID of the payment intent document if successful, otherwise false.
 */
async function createPurchasePaymentIntentDoc(
  username: string,
  ts: number,
  postDocPath: string,
  nftDocPath: string,
  price: number,
  seller: string,
  customer: string
) {
  const newPurchasePaymentIntentData: PurhcasePaymentIntentDocData = {
    currency: "USD",
    id: ts.toString(),
    nftDocPath: nftDocPath,
    postDocPath: postDocPath,
    price: price,
    ts: ts,
    refunded: false,
    seller: seller,
  };

  const id = ts.toString() + "-" + customer;

  try {
    await firestore
      .doc(
        `users/${username}/wallet/paymentIntents/purchasePaymentIntents/${id}`
      )
      .set(newPurchasePaymentIntentData);

    return id;
  } catch (error) {
    console.error("Error while creating purchase payment intent doc", error);
    return false;
  }
}

/**
 * Creates a sell payment intent document.
 * @param customer - The username of the customer.
 * @param ts - The timestamp of the transaction.
 * @param postDocPath - The document path of the post.
 * @param nftDocPath - The document path of the NFT.
 * @param price - The price of the NFT.
 * @returns The ID of the payment intent document if successful, otherwise false.
 */
async function createSellPaymentIntentDoc(
  customer: string,
  ts: number,
  postDocPath: string,
  nftDocPath: string,
  price: number,
  seller: string
) {
  const id = ts.toString() + "-" + customer;

  const newSellPaymentIntentData: SellPaymentIntentDocData = {
    currency: "USD",
    id: id,
    nftDocPath: nftDocPath,
    postDocPath: postDocPath,
    price: price,
    ts: ts,
    refunded: false,
    customer: customer,
  };

  try {
    await firestore
      .doc(`users/${seller}/wallet/paymentIntents/sellPaymentIntents/${id}`)
      .set(newSellPaymentIntentData);

    return id;
  } catch (error) {
    console.error("Error while creating sell payment intent doc", error);
    return false;
  }
}

/**
 * Updates the NFT document with the new buyer information.
 * @param nftDocPath - The document path of the NFT.
 * @param username - The username of the new owner.
 * @returns The updated document if successful, otherwise false.
 */
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

    return {
      username: username,
      nftDocPath: nftDocPath,
      newBuyerObject: newBuyerObject,
    };
  } catch (error) {
    console.error("Error while updating nft doc", error);
    return false;
  }
}

/**
 * Updates the NFT trade document for the buyer.
 * @param postDocPath - The document path of the post.
 * @param nftDocPath - The document path of the NFT.
 * @param username - The username of the buyer.
 * @param ts - The timestamp of the transaction.
 * @returns The updated document if successful, otherwise false.
 */
async function updateNftTradeDocOfBuyer(
  postDocPath: string,
  nftDocPath: string,
  username: string,
  ts: number
) {
  try {
    const nftTradeDocRef = firestore.doc(`users/${username}/nftTrade/nftTrade`);

    const newBoughtObject: BoughtNFTsArrayObject = {
      nftDocPath: nftDocPath,
      postDocPath: postDocPath,
      ts: ts,
    };

    await nftTradeDocRef.update({
      boughtNFTs: FieldValue.arrayUnion(newBoughtObject),
    });

    return {
      customer: username,
      newBoughtObject: newBoughtObject,
    };
  } catch (error) {
    console.error("Error while updating nft trade doc", error);
    return false;
  }
}

/**
 * Updates the NFT trade document for the seller.
 * @param postDocPath - The document path of the post.
 * @param nftDocPath - The document path of the NFT.
 * @param username - The username of the buyer.
 * @param seller - The username of the seller.
 * @param ts - The timestamp of the transaction.
 * @returns The updated document if successful, otherwise false.
 */
async function updateNftTradeDocOfSeller(
  postDocPath: string,
  nftDocPath: string,
  customer: string,
  sellerUsername: string,
  ts: number
) {
  try {
    const nftTradeDocRef = firestore.doc(
      `users/${sellerUsername}/nftTrade/nftTrade`
    );

    const newSoldObject: SoldNFTsArrayObject = {
      nftDocPath: nftDocPath,
      postDocPath: postDocPath,
      ts: ts,
      username: customer,
    };

    await nftTradeDocRef.update({
      soldNFTs: FieldValue.arrayUnion(newSoldObject),
    });

    return {
      seller: sellerUsername,
      newSoldObject: newSoldObject,
    };
  } catch (error) {
    console.error("Error while updating nft trade doc", error);
    return false;
  }
}

/**
 * Rolls back the transaction by reverting all changes.
 * @param username - The username of the buyer.
 * @param seller - The username of the seller.
 * @param updateBalanceResult - The result of updating the buyer's balance.
 * @param updateBalanceOfSellerResult - The result of updating the seller's balance.
 * @param createPurchasePaymentIntentDocResult - The result of creating the purchase payment intent document.
 * @param createSellPaymentIntentDocResult - The result of creating the sell payment intent document.
 * @param updateNftDocResult - The result of updating the NFT document.
 * @param updateNftTradeDocOfBuyerResult - The result of updating the buyer's NFT trade document.
 * @param updateNftTradeDocOfSellerResult - The result of updating the seller's NFT trade document.
 * @returns A promise that resolves when the rollback is complete.
 */
async function rollback(
  customer: string,
  seller: string,
  updateBalanceResult: false | number,
  updateBalanceOfSellerResult: false | number,
  createPurchasePaymentIntentDocResult: string | false,
  createSellPaymentIntentDocResult: string | false,
  updateNftDocResult:
    | false
    | {
        username: string;
        nftDocPath: string;
        newBuyerObject: BuyersArrayObject;
      },
  updateNftTradeDocOfBuyerResult:
    | false
    | {
        customer: string;
        newBoughtObject: BoughtNFTsArrayObject;
      },
  updateNftTradeDocOfSeller:
    | false
    | {
        seller: string;
        newSoldObject: SoldNFTsArrayObject;
      }
) {
  if (updateBalanceResult) {
    const updateBalanceRollback = await updateBalance(
      customer,
      -updateBalanceResult
    );

    if (!updateBalanceRollback) {
      console.error("updateBalanceRollback FAILED");
    }
  }

  if (updateBalanceOfSellerResult) {
    const updateBalanceOfSellerRollback = await updateBalanceOfSeller(
      seller,
      -updateBalanceOfSellerResult
    );

    if (!updateBalanceOfSellerRollback) {
      console.error("updateBalanceOfSellerRollback FAILED");
    }
  }

  if (createPurchasePaymentIntentDocResult) {
    try {
      const purchasePaymentIntentDocRef = firestore.doc(
        `users/${customer}/wallet/paymentIntents/purchasePaymentIntents/${createPurchasePaymentIntentDocResult}`
      );
      await purchasePaymentIntentDocRef.delete();
    } catch (error) {
      console.error(
        "Error while rolling back purchase payment intent doc",
        error
      );
    }
  }

  if (createSellPaymentIntentDocResult) {
    try {
      const sellPaymentIntentDocRef = firestore.doc(
        `users/${seller}/wallet/paymentIntents/sellPaymentIntents/${createSellPaymentIntentDocResult}`
      );
      await sellPaymentIntentDocRef.delete();
    } catch (error) {
      console.error("Error while rolling back sell payment intent doc", error);
    }
  }

  if (updateNftDocResult) {
    try {
      const nftDocRef = firestore.doc(updateNftDocResult.nftDocPath);
      await nftDocRef.update({
        "listStatus.buyers": FieldValue.arrayRemove(
          updateNftDocResult.newBuyerObject
        ),
        "listStatus.stock.remainingStock": FieldValue.increment(1),
      });
    } catch (error) {
      console.error("Error while rolling back nft doc", error);
    }
  }

  if (updateNftTradeDocOfBuyerResult) {
    try {
      const nftTradeDocRef = firestore.doc(
        `users/${updateNftTradeDocOfBuyerResult.customer}/nftTrade/nftTrade`
      );
      await nftTradeDocRef.update({
        boughtNFTs: FieldValue.arrayRemove(
          updateNftTradeDocOfBuyerResult.newBoughtObject
        ),
      });
    } catch (error) {
      console.error("Error while rolling back nft trade doc", error);
    }
  }

  if (updateNftTradeDocOfSeller) {
    try {
      const nftTradeDocRef = firestore.doc(
        `users/${updateNftTradeDocOfSeller.seller}/nftTrade/nftTrade`
      );
      await nftTradeDocRef.update({
        soldNFTs: FieldValue.arrayRemove(
          updateNftTradeDocOfSeller.newSoldObject
        ),
      });
    } catch (error) {
      console.error("Error while rolling back nft trade doc of seller", error);
    }
  }
}

export const buyNFT = onRequest(
  appCheckMiddleware(async (req, res) => {
    const {authorization} = req.headers;
    const {postDocPath} = req.body;

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
      res.status(500).send("Internal Server Error");
      return;
    }

    const postDataCheckResult = isDifferentPersonThanCreator(
      postData,
      username
    );
    if (!postDataCheckResult) {
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

    const checkPurchasingSingleTimeResult = checkPurchasingSingleTime(
      nftData,
      username
    );
    if (!checkPurchasingSingleTimeResult) {
      res.status(500).send("Internal Server Error");
      return;
    }

    const nftPrice = getPrice(nftData);
    if (!nftPrice) {
      res.status(500).send("Internal Server Error");
      return;
    }

    const balance = await getBalance(username);
    if (!balance) {
      res.status(500).send("Internal Server Error");
      return;
    }

    const hasMoneyResult = hasMoney(balance, nftPrice.price);
    if (!hasMoneyResult) {
      res.status(500).send("Internal Server Error");
      return;
    }

    // Checking Finished.

    const commonTimestamp = Date.now();

    const [
      updateBalanceResult,
      updateBalanceOfSellerResult,
      createPurchasePaymentIntentDocResult,
      createSellPaymentIntentDocResult,
      updateNftDocResult,
      updateNftTradeDocOfBuyerResult,
      updateNftTradeDocOfSellerResult,
    ] = await Promise.all([
      updateBalance(username, nftPrice.price),
      updateBalanceOfSeller(postData.senderUsername, nftPrice.price),
      createPurchasePaymentIntentDoc(
        username,
        commonTimestamp,
        postDocPath,
        nftDocPath,
        nftPrice.price,
        postData.senderUsername,
        username
      ),
      createSellPaymentIntentDoc(
        username,
        commonTimestamp,
        postDocPath,
        nftDocPath,
        nftPrice.price,
        postData.senderUsername
      ),
      updateNftDoc(nftDocPath, username),
      updateNftTradeDocOfBuyer(
        postDocPath,
        nftDocPath,
        username,
        commonTimestamp
      ),
      updateNftTradeDocOfSeller(
        postDocPath,
        nftDocPath,
        username,
        postData.senderUsername,
        commonTimestamp
      ),
    ]);
    if (
      !updateBalanceResult ||
      !updateBalanceOfSellerResult ||
      !createPurchasePaymentIntentDocResult ||
      !createSellPaymentIntentDocResult ||
      !updateNftDocResult ||
      !updateNftTradeDocOfBuyerResult ||
      !updateNftTradeDocOfSellerResult
    ) {
      console.error("Error on puchasing NFT!...");
      console.error(
        `${username} wanted to purchase ${nftDocPath} but failed...`
      );

      console.error("Operations results: \n");
      console.error("Update Balance Result: ", updateBalanceResult);
      console.error(
        "Update Balance Of Seller Result: ",
        updateBalanceOfSellerResult
      );
      console.error(
        "Create Purchase Payment Intent Doc Result: ",
        createPurchasePaymentIntentDocResult
      );
      console.error(
        "Create Sell Payment Intent Doc Result: ",
        createSellPaymentIntentDocResult
      );
      console.error("Update Nft Doc Result: ", updateNftDocResult);
      console.error(
        "Update Nft Trade Doc Of Buyer Result: ",
        updateNftTradeDocOfBuyerResult
      );
      console.error(
        "Update Nft Trade Doc Of Seller Result: ",
        updateNftTradeDocOfSellerResult
      );

      console.error("We are rolling back successfull events...");

      await rollback(
        username,
        postData.senderUsername,
        updateBalanceResult,
        updateBalanceOfSellerResult,
        createPurchasePaymentIntentDocResult,
        createSellPaymentIntentDocResult,
        updateNftDocResult,
        updateNftTradeDocOfBuyerResult,
        updateNftTradeDocOfSellerResult
      );
      res.status(500).send("Internal Server Error");
      return;
    }

    res.status(200).send("Successsfull paymaent handled correctly.");
    return;
  })
);
