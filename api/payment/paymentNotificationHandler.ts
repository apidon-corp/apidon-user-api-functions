import { keys } from "../../config";
import { onRequest } from "firebase-functions/v2/https";

function handleAuthorization(authorization: string | undefined) {
  if (!authorization) {
    console.error("Authorization header is missing");
    return false;
  }

  return authorization === keys.REVENUE_CAT_WEBHOOK_AUTH_KEY;
}

export const paymentNotificationHandler = onRequest(async (req, res) => {
  const { authorization } = req.headers;

  const body = req.body;

  const authResult = handleAuthorization(authorization);
  if (!authResult) {
    res.status(401).send("Unauthorized");
    return;
  }

  console.log("Received payment notification:(body)", body);

  res.status(200).send("OK");
});
