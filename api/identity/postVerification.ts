import {onRequest} from "firebase-functions/v2/https";
import {internalAPIRoutes, keys} from "../../config";

import Stripe from "stripe";
const stripe = new Stripe(keys.IDENTITY.STRIPE_SECRET_KEY);

async function getEvent(payload: string | Buffer, signature: string) {
  const webHookSecret = keys.IDENTITY.POST_VERIFICATION_WEBHOOK_SECRET;

  if (!webHookSecret) {
    console.error("Web Hook Secret is undefined from config");
    return false;
  }

  try {
    const event = await stripe.webhooks.constructEventAsync(
      payload,
      signature,
      webHookSecret
    );

    return event;
  } catch (error) {
    console.error("Stripe Web-Hook error: ", error);
    return false;
  }
}

async function handleSuccessfullVerification(
  username: string,
  id: string,
  created: number,
  status: string,
  livemode: boolean
) {
  const handleSuccessfulVerificationApiKey =
    keys.IDENTITY.HANDLE_SUCCESSFUL_VERIFICATION_API_KEY;

  try {
    const response = await fetch(
      internalAPIRoutes.identity.handleSuccessfulVerification,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "authorization": handleSuccessfulVerificationApiKey,
        },
        body: JSON.stringify({username, id, created, status, livemode}),
      }
    );

    if (!response.ok) {
      console.error(
        "handleSuccessfulVerification API request failed: ",
        await response.text()
      );
      return false;
    }

    return true;
  } catch (error) {
    console.error(
      "handleSuccessfulVerification API request network error: ",
      error
    );
    return false;
  }
}

export const postVerification = onRequest(async (req, res) => {
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

  if (event.type !== "identity.verification_session.verified") {
    console.error("Event type is not identity.verification_session.verified");
    res.status(422).send("Invalid Request");
    return;
  }

  const handleSuccessfullVerificationResult =
    await handleSuccessfullVerification(
      event.data.object.metadata.username,
      event.data.object.id,
      event.data.object.created,
      event.data.object.status,
      event.data.object.livemode
    );

  if (!handleSuccessfullVerificationResult) {
    console.error("handleSuccessfullVerification failed. See above logs.");
    res.status(500).send("Internal Server Error");
    return;
  }

  event.data.object.status == "verified";

  res.status(200).send("OK");

  return;
});
