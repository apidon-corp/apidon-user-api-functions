import { onRequest } from "firebase-functions/v2/https";
import { internalAPIRoutes, keys } from "../../config";

import Stripe from "stripe";
const stripe = new Stripe(keys.STRIPE_SECRET_KEY);

async function getEvent(payload: string | Buffer, signature: string) {
  const web_hook_secret = keys.STRIPE_CLI_WEBHOOK_SECRET_LOCAL;

  if (!web_hook_secret) {
    console.error("Web Hook Secret is undefined from config");
    return false;
  }

  try {
    const event = await stripe.webhooks.constructEventAsync(
      payload,
      signature,
      web_hook_secret
    );

    return event;
  } catch (error) {
    console.error("Stripe Web-Hook error: ", error);
    return false;
  }
}

async function handlePaymentIntentSuccess(successfullPaymentIntentId: string) {
  const successOnPaymentAPIKey = keys.SUCCESS_ON_PAYMENT_API_KEY;
  try {
    const response = await fetch(
      internalAPIRoutes.nft.postPaymentOperations.successOnPayment,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          authorization: successOnPaymentAPIKey,
        },
        body: JSON.stringify({ paymentIntentId: successfullPaymentIntentId }),
      }
    );

    if (!response.ok) {
      console.error(
        "Success on payment API request failed: ",
        await response.text()
      );
      return false;
    }

    return true;
  } catch (error) {
    console.error("Success on payment API request network error: ", error);
    return false;
  }
}

export const postPayment = onRequest(async (req, res) => {
  const sig = req.headers["stripe-signature"];

  if (!sig) {
    res.status(422).send("Invalid Request");
    return;
  }

  const event = await getEvent(req.rawBody, sig as string);

  if (!event) {
    res.status(500).send("Internal Server Error");
    return;
  }

  if (event.type === "payment_intent.succeeded") {
    console.log(
      "PaymentIntent was successful for (customer) " +
        event.data.object.metadata.username
    );
    console.log(
      "PaymentIntent was successful for (payment id) " + event.data.object.id
    );
    console.log("Now, we are calling successOnPayment API...");

    const successfullPaymentIntentId = event.data.object.id;
    handlePaymentIntentSuccess(successfullPaymentIntentId);
  }

  res.status(200).send("Success");

  return;
});
