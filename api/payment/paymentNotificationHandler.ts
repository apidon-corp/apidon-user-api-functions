import { internalAPIRoutes, keys } from "../../config";
import { onRequest } from "firebase-functions/v2/https";
import { RevenueCatNotificationPayload } from "../../types/IAP";

function handleAuthorization(authorization: string | undefined) {
  if (!authorization) {
    console.error("Authorization header is missing");
    return false;
  }

  return authorization === keys.REVENUE_CAT_WEBHOOK_AUTH_KEY;
}

function getTypeOfNotification(payload: RevenueCatNotificationPayload) {
  const type = payload.type;
  return type;
}

async function handleSuccessfullPayment(
  payload: RevenueCatNotificationPayload
) {
  const successOnPaymentAPIRoute = internalAPIRoutes.payment.successonPayment;
  const apiKey = keys.SUCCESS_ON_PAYMENT_API_AUTH_KEY;

  try {
    const response = await fetch(successOnPaymentAPIRoute, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        productId: payload.id,
        customerId: payload.app_user_id,
        transactionId: payload.id,
        ts: payload.event_timestamp_ms,
      }),
    });

    if (!response.ok) {
      console.error("Failed to send payment notification");
      return false;
    }

    return true;
  } catch (error) {
    console.error("Error sending payment notification:", error);
    return false;
  }
}

export const paymentNotificationHandler = onRequest(async (req, res) => {
  const { authorization } = req.headers;

  const body = req.body;

  const authResult = handleAuthorization(authorization);
  if (!authResult) {
    res.status(401).send("Unauthorized");
    return;
  }

  const type = getTypeOfNotification(body);

  if (type === "NON_RENEWING_PURCHASE") {
    handleSuccessfullPayment(body);
  }

  if (type === "TEST") {
    console.log("Test notification received");
  }

  res.status(200).send("OK");
});
