import { internalAPIRoutes } from "../../config";
import { onRequest } from "firebase-functions/v2/https";
import { RevenueCatNotificationPayload } from "../../types/IAP";
import { getConfigObject } from "../../configs/getConfigObject";
import { Config } from "../../types/Config";

const configObject = getConfigObject();

if (!configObject) {
  throw new Error("Config object is undefined");
}

function handleAuthorization(authorization: string | undefined) {
  if (!authorization) {
    console.error("Authorization header is missing");
    return false;
  }

  if (!configObject) {
    console.error("Config object is undefined");
    return false;
  }

  return {
    authResult: authorization === configObject.REVENUE_CAT_WEBHOOK_AUTH_KEY,
    configObject: configObject,
  };
}

function getTypeOfNotification(payload: RevenueCatNotificationPayload) {
  const type = payload.type;
  return type;
}

async function handleSuccessfullPayment(
  payload: RevenueCatNotificationPayload,
  configObject: Config
) {
  const successOnPaymentAPIRoute = internalAPIRoutes.payment.successonPayment;
  const apiKey = configObject.SUCCESS_ON_PAYMENT_API_AUTH_KEY;

  try {
    const response = await fetch(successOnPaymentAPIRoute, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: apiKey,
      },
      body: JSON.stringify({
        productId: payload.product_id,
        customerId: payload.app_user_id,
        transactionId: payload.transaction_id,
        ts: payload.event_timestamp_ms,
        price: payload.price,
        priceInPurchasedCurrency: payload.price_in_purchased_currency,
        currency: payload.currency,
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

async function handleRefund(
  payload: RevenueCatNotificationPayload,
  configObject: Config
) {
  const refundApiRoute = internalAPIRoutes.payment.refund;
  const refundApiKey = configObject.REFUND_API_AUTH_KEY;

  try {
    const response = await fetch(refundApiRoute, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: refundApiKey,
      },
      body: JSON.stringify({
        productId: payload.product_id,
        customerId: payload.app_user_id,
        transactionId: payload.transaction_id,
      }),
    });

    if (!response.ok) {
      const message = await response.text();

      console.error("Response from refundAPI route is not good: ", message);
      return {
        status: "failed",
        message: message,
      };
    }

    return {
      status: "successful",
      message: "",
    };
  } catch (error) {
    console.error(
      "Error sending refund request to our internal servers (apidon):",
      error
    );
    return {
      status: "failed",
      message: "Fetch error",
    };
  }
}

export const paymentNotificationHandler = onRequest(async (req, res) => {
  const { authorization } = req.headers;

  const { event } = req.body;

  const authResult = handleAuthorization(authorization);
  if (!authResult || !authResult.authResult) {
    res.status(401).send("Unauthorized");
    return;
  }

  const type = getTypeOfNotification(event);

  if (type === "NON_RENEWING_PURCHASE") {
    const result = await handleSuccessfullPayment(
      event,
      authResult.configObject
    );
    if (!result) {
      res.status(500).send("Internal Server Error");
      return;
    }
    res.status(200).send("OK");
    return;
  }

  if (type === "CANCELLATION") {
    const result = await handleRefund(event, authResult.configObject);
    if (result.status === "failed") {
      res.status(500).send(result.message);
      return;
    }
    res.status(200).send("OK");
    return;
  }

  if (type === "TEST") {
    console.log("Test notification received");
    res.status(200).send("OK");
    return;
  }

  console.log("Unknown notification type received");
  console.log("Body: \n", event);

  res.status(500).send("Internal Server Error");
  return;
});
