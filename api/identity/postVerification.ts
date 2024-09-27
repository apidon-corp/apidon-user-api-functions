import {onRequest} from "firebase-functions/v2/https";
import {internalAPIRoutes} from "../../helpers/internalApiRoutes";

import AsyncLock = require("async-lock");
import {getConfigObject} from "../../configs/getConfigObject";

import Stripe from "stripe";
import {ConfigObject} from "@/types/Admin";

const configObject = getConfigObject();

if (!configObject) {
  throw new Error("Config object is undefined");
}

const stripe = new Stripe(configObject.STRIPE_SECRET_KEY);

const lock = new AsyncLock();

async function getEvent(payload: string | Buffer, signature: string) {
  if (!configObject) {
    console.error("Config object is undefined");
    return false;
  }

  const webHookSecret = configObject.POST_VERIFICATION_WEBHOOK_SECRET;

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

    return {
      event,
      configObject,
    };
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
  livemode: boolean,
  configObject: ConfigObject
) {
  const handleCreatedVerificationApiKey =
    configObject.HANDLE_CREATED_VERIFICATION_API_KEY;

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
  livemode: boolean,
  configObject: ConfigObject
) {
  const handleProcessingVerificationApiKey =
    configObject.HANDLE_PROCESSING_VERIFICATION_API_KEY;

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
  livemode: boolean,
  configObject: ConfigObject
) {
  const handleSuccessfulVerificationApiKey =
    configObject.HANDLE_SUCCESSFUL_VERIFICATION_API_KEY;

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
  livemode: boolean,
  configObject: ConfigObject
) {
  const handleReuqiresInputVerificationApiKey =
    configObject.HANDLE_REQUIRES_INPUT_VERIFICATION_API_KEY;

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

  const eventResult = await getEvent(req.rawBody, sig as string);

  if (!eventResult) {
    res.status(500).send("Internal Server Error");
    return;
  }

  const {event, configObject} = eventResult;

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
    let success = false;

    await lock.acquire(username, async () => {
      if (event.type === "identity.verification_session.created") {
        success = await handleCreatedVerification(
          event.data.object.metadata.username,
          event.data.object.id,
          event.data.object.created,
          event.data.object.status,
          event.data.object.livemode,
          configObject
        );
      }

      if (event.type === "identity.verification_session.processing") {
        success = await handleProcessingVerification(
          event.data.object.metadata.username,
          event.data.object.id,
          event.data.object.created,
          event.data.object.status,
          event.data.object.livemode,
          configObject
        );
      }

      if (event.type === "identity.verification_session.verified") {
        success = await handleSuccessfullVerification(
          event.data.object.metadata.username,
          event.data.object.id,
          event.data.object.created,
          event.data.object.status,
          event.data.object.livemode,
          configObject
        );
      }

      if (event.type === "identity.verification_session.requires_input") {
        success = await handleReuqiresInputVerification(
          event.data.object.metadata.username,
          event.data.object.id,
          event.data.object.created,
          event.data.object.status,
          event.data.object.livemode,
          configObject
        );
      }
    });

    if (success) {
      res.status(200).send("OK");
    } else {
      res.status(500).send("Internal Server Error");
    }
  } catch (error) {
    console.error("Lock error: ", error);
    res.status(500).send("Internal Server Error");
    return;
  }
});
