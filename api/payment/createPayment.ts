import { onRequest } from "firebase-functions/v2/https";
import { keys } from "../../config";

import Stripe from "stripe";
const stripe = new Stripe(keys.STRIPE_SECRET_KEY);

function checkProps(price: number) {
  if (!price) return false;
  return true;
}

function handleAuthorization(authorization: string | undefined) {
  if (!authorization) return false;

  return authorization === keys.CREATE_PAYMENT_API_KEY;
}

async function getStripeCustomerId(
  stripeCustomerId: string | undefined,
  username: string
) {
  if (stripeCustomerId) return stripeCustomerId;

  try {
    const customer = await stripe.customers.create({
      name: username,
    });
    return customer.id;
  } catch (error) {
    console.error("Error creating customer: ", error);
    return false;
  }
}

async function createEphemeralKey(customerId: string) {
  try {
    const ephemeralKey = await stripe.ephemeralKeys.create(
      {
        customer: customerId,
      },
      { apiVersion: "2024-06-20" }
    );
    return ephemeralKey;
  } catch (error) {
    console.error("Error creating ephemeral key: ", error);
    return false;
  }
}

async function createPaymentIntent(customerId: string, price: number) {
  try {
    const paymentIntent = await stripe.paymentIntents.create({
      amount: price * 100,
      currency: "usd",
      customer: customerId,
    });
    return paymentIntent;
  } catch (error) {
    console.error("Error creating payment intent: ", error);
    return false;
  }
}

export const createPayment = onRequest(async (req, res) => {
  const { authorization } = req.headers;
  const { price, stripeCustomerId, username } = req.body;

  const authorizationResult = handleAuthorization(authorization);
  if (!authorizationResult) {
    res.status(401).send("Unauthorized");
    return;
  }

  const checkPropsResult = checkProps(price);
  if (!checkPropsResult) {
    res.status(422).send("Invalid Request");
    return;
  }

  const customerID = await getStripeCustomerId(stripeCustomerId, username);
  if (!customerID) {
    res.status(500).send("Internal Server Error");
    return;
  }

  const ephemeralKey = await createEphemeralKey(customerID);
  if (!ephemeralKey) {
    res.status(500).send("Internal Server Error");
    return;
  }

  const paymentIntent = await createPaymentIntent(customerID, price);
  if (!paymentIntent) {
    res.status(500).send("Internal Server Error");
    return;
  }

  const responseObject = {
    paymentId: paymentIntent.id,
    paymentIntent: paymentIntent.client_secret,
    ephemeralKey: ephemeralKey.secret,
    customer: customerID,
    publishableKey: "pk_test_TYooMQauvdEDq54NiTphI7jx",
    createdStripeCustomerId: stripeCustomerId ? undefined : customerID,
  };

  res.status(200).json(responseObject);
  return;
});
