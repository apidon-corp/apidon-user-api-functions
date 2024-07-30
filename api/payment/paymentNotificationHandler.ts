import {internalAPIRoutes, keys} from "../../config";
import {onRequest} from "firebase-functions/v2/https";
import {RevenueCatNotificationPayload} from "../../types/IAP";

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
        "Authorization": apiKey,
      },
      body: JSON.stringify({
        productId: payload.product_id,
        customerId: payload.app_user_id,
        transactionId: payload.id,
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

async function handleRefund(payload: RevenueCatNotificationPayload) {
  const refundApiRoute = internalAPIRoutes.payment.refund;
  const refundApiKey = keys.REFUND_API_AUTH_KEY;

  try {
    const response = await fetch(refundApiRoute, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": refundApiKey,
      },
      body: JSON.stringify({
        productId: payload.product_id,
        customerId: payload.app_user_id,
        transactionId: payload.transaction_id,
      }),
    });

    if (!response.ok) {
      console.error(
        "Response from refundAPI route is not good: ",
        await response.text()
      );
      return false;
    }

    return true;
  } catch (error) {
    console.error(
      "Error sending refund request to our internal servers (apidon):",
      error
    );
    return false;
  }
}

export const paymentNotificationHandler = onRequest(async (req, res) => {
  const {authorization} = req.headers;

  const {event} = req.body;

  const authResult = handleAuthorization(authorization);
  if (!authResult) {
    res.status(401).send("Unauthorized");
    return;
  }

  const type = getTypeOfNotification(event);

  if (type === "NON_RENEWING_PURCHASE") {
    const result = await handleSuccessfullPayment(event);
    if (!result) {
      res.status(500).send("Internal Server Error");
      return;
    }
    res.status(200).send("OK");
    return;
  } else if (type === "CANCELLATION") {
    const result = await handleRefund(event);
    if (!result) {
      res.status(500).send("Internal Server Error");
      return;
    }
    res.status(200).send("OK");
    return;
  } else if (type === "TEST") {
    console.log("Test notification received");
    res.status(200).send("OK");
    return;
  } else {
    console.log("Unknown notification type received");
    console.log("Body: \n", event);
    res.status(500).send("Internal Server Error");
    return;
  }
});
