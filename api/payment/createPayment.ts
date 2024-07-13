import { onRequest } from "firebase-functions/v2/https";

import { appCheckMiddleware } from "../../middleware/appCheckMiddleware";
import { keys } from "../../config";

import Stripe from "stripe";
const stripe = new Stripe(keys.STRIPE_SECRET_KEY);

async function createStripeCustomer() {
  try {
    const customer = await stripe.customers.create();
    return customer;
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

async function createPaymentIntent(customerId: string) {
  try {
    const paymentIntent = await stripe.paymentIntents.create({
      amount: 2000,
      currency: "usd",
      customer: customerId,
    });
    return paymentIntent;
  } catch (error) {
    console.error("Error creating payment intent: ", error);
    return false;
  }
}

export const createPayment = onRequest(
  appCheckMiddleware(async (req, res) => {
    const customer = await createStripeCustomer();
    if (!customer) {
      res.status(500).send("Internal Server Error");
      return;
    }

    const ephemeralKey = await createEphemeralKey(customer.id);
    if (!ephemeralKey) {
      res.status(500).send("Internal Server Error");
      return;
    }

    const paymentIntent = await createPaymentIntent(customer.id);
    if (!paymentIntent) {
      res.status(500).send("Internal Server Error");
      return;
    }

    const responseObject = {
      paymentIntent: paymentIntent.client_secret,
      ephemeralKey: ephemeralKey.secret,
      customer: customer.id,
      publishableKey: "pk_test_TYooMQauvdEDq54NiTphI7jx",
    };

    res.status(200).json(responseObject);
    return;
  })
);
