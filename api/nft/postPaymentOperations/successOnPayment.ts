import { onRequest } from "firebase-functions/v2/https";

import { keys } from "../../../config";

import { PaymentIntentDocDataUpdateable } from "../../../types/Trade";

import Stripe from "stripe";
import { firestore } from "../../../firebase/adminApp";
const stripe = new Stripe(keys.STRIPE_SECRET_KEY);

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

export const successOnPayment = onRequest(async (req, res) => {
  const { authorization } = req.headers;
  const { paymentIntentId } = req.body;

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

  res.status(200).send("Payment intent retrieved successfully");
  return;
});
