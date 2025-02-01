import {onRequest} from "firebase-functions/https";
import getDisplayName from "../../helpers/getDisplayName";
import {appCheckMiddleware} from "../../middleware/appCheckMiddleware";

import Stripe from "stripe";

import {defineSecret} from "firebase-functions/params";
import {isProduction} from "../../helpers/projectVersioning";

const stripeSecretKeySecret = defineSecret("STRIPE_SECRET_KEY");

async function handleAuthorization(key: string | undefined) {
  if (key === undefined) {
    console.error("Unauthorized attemp to createVerificationSession API.");
    return false;
  }

  const operationFromUsername = await getDisplayName(key);
  if (!operationFromUsername) return false;

  return operationFromUsername;
}

async function getVerificationSession(username: string, stripe: Stripe) {
  try {
    const verificationSession =
      await stripe.identity.verificationSessions.create({
        type: "document",
        options: {
          document: {
            require_matching_selfie: true,
            require_live_capture: true,
            allowed_types: ["id_card"],
          },
        },
        metadata: {
          username: username,
        },
      });

    return verificationSession;
  } catch (error) {
    console.error("Error creating verification session:", error);
    return false;
  }
}

async function createEphermalKey(
  verificationSession: Stripe.Response<Stripe.Identity.VerificationSession>,
  stripe: Stripe
) {
  try {
    const ephemeralKey = await stripe.ephemeralKeys.create(
      {verification_session: verificationSession.id},
      {apiVersion: "2024-06-20"}
    );

    return ephemeralKey;
  } catch (error) {
    console.error("Error creating ephemeral key:", error);
    return false;
  }
}

export const createVerificationSession = onRequest(
  {secrets: [stripeSecretKeySecret]},
  appCheckMiddleware(async (req, res) => {
    if (isProduction()) {
      res.status(403).send("Forbidden");
      return;
    }

    const {authorization} = req.headers;

    const username = await handleAuthorization(authorization);
    if (!username) {
      res.status(401).send("Unauthorized");
      return;
    }

    const stripe = new Stripe(stripeSecretKeySecret.value());

    const verificationSession = await getVerificationSession(username, stripe);
    if (!verificationSession) {
      res.status(500).send("Internal Server Error");
      return;
    }

    const ephemeralKey = await createEphermalKey(verificationSession, stripe);
    if (!ephemeralKey) {
      res.status(500).send("Internal Server Error");
      return;
    }

    const verficationSessionId = verificationSession.id;
    const ephemeralKeySecret = ephemeralKey.secret;

    if (!verficationSessionId || !ephemeralKeySecret) {
      console.error(
        "Error: verficationSessionId or ephemeralKeySecret is null",
        verficationSessionId,
        ephemeralKeySecret
      );
      res.status(500).send("Internal Server Error");
      return;
    }

    res.status(200).json({
      verficationSessionId,
      ephemeralKeySecret,
    });

    return;
  })
);
