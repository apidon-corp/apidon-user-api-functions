import {onRequest} from "firebase-functions/https";
import {defineSecret} from "firebase-functions/params";
import Stripe from "stripe";
import {getRoutes} from "../../helpers/internalApiRoutes";
import {isProduction} from "../../helpers/projectVersioning";

import * as AsyncLock from "async-lock";

const stripeSecretKeySecret = defineSecret("STRIPE_SECRET_KEY");

const handleCreatedVerificationAPIKeySecret = defineSecret(
  "HANDLE_CREATED_VERIFICATION_API_KEY"
);

const handleProcessingVerificationApiKeySecret = defineSecret(
  "HANDLE_PROCESSING_VERIFICATION_API_KEY"
);

const handleSuccessfulVerificationApiKeySecret = defineSecret(
  "HANDLE_SUCCESSFUL_VERIFICATION_API_KEY"
);

const handleReuqiresInputVerificationApiKeySecret = defineSecret(
  "HANDLE_REQUIRES_INPUT_VERIFICATION_API_KEY"
);

const postVerificationWebhookSecretSecret = defineSecret(
  "POST_VERIFICATION_WEBHOOK_SECRET"
);

const lock = new AsyncLock();

async function getEvent(
  payload: string | Buffer,
  signature: string,
  postVerificationWebhookKey: string,
  stripe: Stripe
) {
  const webHookSecret = postVerificationWebhookKey;

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
  handleCreatedVerificationApiKey: string
) {
  try {
    const response = await fetch(
      getRoutes().identity.handleCreatedVerification,
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
  handleProcessingVerificationApiKey: string
) {
  try {
    const response = await fetch(
      getRoutes().identity.handleProcessingVerification,
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
  handleSuccessfulVerificationApiKey: string
) {
  try {
    const response = await fetch(
      getRoutes().identity.handleSuccessfulVerification,
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
  handleReuqiresInputVerificationApiKey: string
) {
  try {
    const response = await fetch(
      getRoutes().identity.handleReuqiresInputVerification,
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

export const postVerification = onRequest(
  {
    secrets: [
      stripeSecretKeySecret,
      handleCreatedVerificationAPIKeySecret,
      handleProcessingVerificationApiKeySecret,
      handleSuccessfulVerificationApiKeySecret,
      handleReuqiresInputVerificationApiKeySecret,
      postVerificationWebhookSecretSecret,
    ],
  },
  async (req, res) => {
    if (isProduction()) {
      res.status(403).send("Forbidden");
      return;
    }

    const sig = req.headers["stripe-signature"];

    if (!sig) {
      res.status(422).send("Invalid Request");
      return;
    }

    const stripe = new Stripe(stripeSecretKeySecret.value());

    const eventResult = await getEvent(
      req.rawBody,
      sig as string,
      postVerificationWebhookSecretSecret.value(),
      stripe
    );

    if (!eventResult) {
      res.status(500).send("Internal Server Error");
      return;
    }

    const {event} = eventResult;

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
            handleCreatedVerificationAPIKeySecret.value()
          );
        }

        if (event.type === "identity.verification_session.processing") {
          success = await handleProcessingVerification(
            event.data.object.metadata.username,
            event.data.object.id,
            event.data.object.created,
            event.data.object.status,
            event.data.object.livemode,
            handleProcessingVerificationApiKeySecret.value()
          );
        }

        if (event.type === "identity.verification_session.verified") {
          success = await handleSuccessfullVerification(
            event.data.object.metadata.username,
            event.data.object.id,
            event.data.object.created,
            event.data.object.status,
            event.data.object.livemode,
            handleSuccessfulVerificationApiKeySecret.value()
          );
        }

        if (event.type === "identity.verification_session.requires_input") {
          success = await handleReuqiresInputVerification(
            event.data.object.metadata.username,
            event.data.object.id,
            event.data.object.created,
            event.data.object.status,
            event.data.object.livemode,
            handleReuqiresInputVerificationApiKeySecret.value()
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
  }
);
