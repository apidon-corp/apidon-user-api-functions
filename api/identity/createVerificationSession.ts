import {onRequest} from "firebase-functions/v2/https";
import {appCheckMiddleware} from "../../middleware/appCheckMiddleware";
import getDisplayName from "../../helpers/getDisplayName";

import Stripe from "stripe";
import {getConfigObject} from "../../configs/getConfigObject";
import {Environment} from "@/types/Admin";

const configObject = getConfigObject();

if (!configObject) {
  throw new Error("Config object is undefined");
}

const stripe = new Stripe(configObject.STRIPE_SECRET_KEY);

async function handleAuthorization(key: string | undefined) {
  if (key === undefined) {
    console.error("Unauthorized attemp to createVerificationSession API.");
    return false;
  }

  const operationFromUsername = await getDisplayName(key);
  if (!operationFromUsername) return false;

  return operationFromUsername;
}

async function getVerificationSession(username: string) {
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
  verificationSession: Stripe.Response<Stripe.Identity.VerificationSession>
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
  appCheckMiddleware(async (req, res) => {
    const environment = process.env.ENVIRONMENT as Environment;

    if (!environment || environment === "PRODUCTION") {
      res.status(403).send("Forbidden");
      return;
    }

    const {authorization} = req.headers;

    const username = await handleAuthorization(authorization);
    if (!username) {
      res.status(401).send("Unauthorized");
      return;
    }

    const verificationSession = await getVerificationSession(username);
    if (!verificationSession) {
      res.status(500).send("Internal Server Error");
      return;
    }

    const ephemeralKey = await createEphermalKey(verificationSession);
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
