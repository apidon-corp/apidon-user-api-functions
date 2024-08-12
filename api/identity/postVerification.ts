import {onRequest} from "firebase-functions/v2/https";
import {internalAPIRoutes, keys} from "../../config";

import Stripe from "stripe";
import AsyncLock = require("async-lock");
const stripe = new Stripe(keys.IDENTITY.STRIPE_SECRET_KEY);

const lock = new AsyncLock();

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

async function handleCreatedVerification(
  username: string,
  id: string,
  created: number,
  status: string,
  livemode: boolean
) {
  const handleCreatedVerificationApiKey =
    keys.IDENTITY.HANDLE_CREATED_VERIFICATION_API_KEY;

  try {
    const response = await fetch(
      internalAPIRoutes.identity.handleCreatedVerification,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "authorization": handleCreatedVerificationApiKey,
        },
        body: JSON.stringify({username, id, created, status, livemode}),
      }
    );

    if (!response.ok) {
      console.error(
        "handleCreatedVerification API's response not ok: ",
        await response.text()
      );
      return false;
    }

    return true;
  } catch (error) {
    console.error(
      "handleCreatedVerification API request network error: ",
      error
    );
    return false;
  }
}

async function handleProcessingVerification(
  username: string,
  id: string,
  created: number,
  status: string,
  livemode: boolean
) {
  const handleProcessingVerificationApiKey =
    keys.IDENTITY.HANDLE_PROCESSING_VERIFICATION_API_KEY;

  try {
    const response = await fetch(
      internalAPIRoutes.identity.handleProcessingVerification,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "authorization": handleProcessingVerificationApiKey,
        },
        body: JSON.stringify({username, id, created, status, livemode}),
      }
    );

    if (!response.ok) {
      console.error(
        "handleProcessingVerification API request failed: ",
        await response.text()
      );
      return false;
    }

    return true;
  } catch (error) {
    console.error(
      "handleProcessingVerification API request network error: ",
      error
    );
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

async function handleReuqiresInputVerification(
  username: string,
  id: string,
  created: number,
  status: string,
  livemode: boolean
) {
  const handleReuqiresInputVerificationApiKey =
    keys.IDENTITY.HANDLE_REQUIRES_INPUT_VERIFICATION_API_KEY;

  try {
    const response = await fetch(
      internalAPIRoutes.identity.handleReuqiresInputVerification,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "authorization": handleReuqiresInputVerificationApiKey,
        },
        body: JSON.stringify({username, id, created, status, livemode}),
      }
    );

    if (!response.ok) {
      console.error(
        "handleReuqiresInputVerification API request failed: ",
        await response.text()
      );
      return false;
    }

    return true;
  } catch (error) {
    console.error(
      "handleReuqiresInputVerification API request network error: ",
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

  if (
    event.type !== "identity.verification_session.created" &&
    event.type !== "identity.verification_session.processing" &&
    event.type !== "identity.verification_session.verified" &&
    event.type !== "identity.verification_session.requires_input"
  ) {
    res.status(422).send("Invalid Request");
    return;
  }

  const username = event.data.object.metadata.username || "";

  if (!username) {
    console.error("Username is undefined");
    res.status(422).send("Invalid Request");
    return;
  }

  try {
    await lock.acquire(username, async () => {
      if (event.type === "identity.verification_session.created") {
        const handleCreatedVerificationResult = await handleCreatedVerification(
          event.data.object.metadata.username,
          event.data.object.id,
          event.data.object.created,
          event.data.object.status,
          event.data.object.livemode
        );

        if (!handleCreatedVerificationResult) {
          console.error("handleCreatedVerification failed. See above logs.");
          res.status(500).send("Internal Server Error");
          return;
        }

        res.status(200).send("OK");
        return;
      }

      if (event.type === "identity.verification_session.processing") {
        const handleProcessingVerificationResult =
          await handleProcessingVerification(
            event.data.object.metadata.username,
            event.data.object.id,
            event.data.object.created,
            event.data.object.status,
            event.data.object.livemode
          );

        if (!handleProcessingVerificationResult) {
          console.error("handleProcessingVerification failed. See above logs.");
          res.status(500).send("Internal Server Error");
          return;
        }
        res.status(200).send("OK");
        return;
      }

      if (event.type === "identity.verification_session.verified") {
        const handleSuccessfullVerificationResult =
          await handleSuccessfullVerification(
            event.data.object.metadata.username,
            event.data.object.id,
            event.data.object.created,
            event.data.object.status,
            event.data.object.livemode
          );

        if (!handleSuccessfullVerificationResult) {
          console.error(
            "handleSuccessfullVerification failed. See above logs."
          );
          res.status(500).send("Internal Server Error");
          return;
        }

        res.status(200).send("OK");
        return;
      }

      if (event.type === "identity.verification_session.requires_input") {
        const handleReuqiresInputVerificationResult =
          await handleReuqiresInputVerification(
            event.data.object.metadata.username,
            event.data.object.id,
            event.data.object.created,
            event.data.object.status,
            event.data.object.livemode
          );

        if (!handleReuqiresInputVerificationResult) {
          console.error(
            "handleReuqiresInputVerification failed. See above logs."
          );
          res.status(500).send("Internal Server Error");
          return;
        }

        res.status(200).send("OK");
        return;
      }

      console.error("Unknown event type");
      res.status(422).send("Invalid Request");
      return;
    });

    console.error(
      "postVerification API is not returned a response on try-catch with async-lock."
    );
    res.status(500).send("Internal Server Error");
    return;
  } catch (error) {
    console.error("Lock error: ", error);
    res.status(500).send("Internal Server Error");
    return;
  }
});
