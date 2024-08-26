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

async function handleRefund(payload: RevenueCatNotificationPayload): Promise<{
  status: "successful" | "failed";
  message: string;
}> {
  if (payload.expiration_at_ms) {
    // Here we handle subscription refunds....

    if (!payload.cancel_reason) {
      console.error("Cancel reason is missing in the payload");
      return {
        status: "failed",
        message: "Cancel reason is missing in the payload",
      };
    }

    if (payload.cancel_reason === "CUSTOMER_SUPPORT") {
      // We need to handle this situation like instant-expiration
      // Because "expired" event won't come.
      const handleExpirationResult = await handleExpiration(payload);
      if (!handleExpirationResult) {
        return {
          status: "failed",
          message:
            "Failed to handle expiration for customer_support cancellation event.",
        };
      }

      return {
        status: "successful",
        message: "",
      };
    }

    const message = `We received a CANCELLATION event that it's reason: ${payload.cancel_reason} We need to handle this manually.`;
    return {
      status: "successful",
      message: message,
    };
  }

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

async function handleInitialPurchase(payload: RevenueCatNotificationPayload) {
  const initialPurchaseAPIRoute =
    internalAPIRoutes.payment.successOnInitialPurchase;
  const initialPurchaseAPIKey = keys.SUBSCRIPTIONS.INITIAL_PURHCASE_API_KEY;

  if (!initialPurchaseAPIKey || !initialPurchaseAPIRoute) {
    console.error("Initial purchase API key or route is missing");
    return false;
  }

  try {
    const response = await fetch(initialPurchaseAPIRoute, {
      headers: {
        "authorization": initialPurchaseAPIKey,
        "Content-Type": "application/json",
      },
      method: "POST",
      body: JSON.stringify({
        productId: payload.product_id,
        periodType: payload.period_type,
        purchasedTs: payload.purchased_at_ms,
        expirationTs: payload.expiration_at_ms,
        store: payload.store,
        environment: payload.environment,
        countryCode: payload.country_code,
        customerId: payload.app_user_id,
        transactionId: payload.transaction_id,
        offerCode: payload.offer_code || "",
        ts: payload.event_timestamp_ms,
        price: payload.price,
        priceInPurchasedCurrency: payload.price_in_purchased_currency,
        currency: payload.currency,
      }),
    });

    if (!response.ok) {
      console.error(
        "Response from initialPurchase API is not okay: ",
        await response.text()
      );
      return false;
    }

    return true;
  } catch (error) {
    console.error("Error sending initial purchase notification:", error);
    return false;
  }
}

async function handleRenewal(payload: RevenueCatNotificationPayload) {
  const renewalAPIRoute = internalAPIRoutes.payment.successOnRenewal;
  const renewalAPIKey = keys.SUBSCRIPTIONS.RENEWAL_API_KEY;

  try {
    const response = await fetch(renewalAPIRoute, {
      headers: {
        "authorization": renewalAPIKey,
        "Content-Type": "application/json",
      },
      method: "POST",
      body: JSON.stringify({
        productId: payload.product_id,
        periodType: payload.period_type,
        purchasedTs: payload.purchased_at_ms,
        expirationTs: payload.expiration_at_ms,
        store: payload.store,
        environment: payload.environment,
        countryCode: payload.country_code,
        customerId: payload.app_user_id,
        transactionId: payload.transaction_id,
        offerCode: payload.offer_code || "",
        ts: payload.event_timestamp_ms,
        price: payload.price,
        priceInPurchasedCurrency: payload.price_in_purchased_currency,
        currency: payload.currency,
      }),
    });

    if (!response.ok) {
      console.error(
        "Response from renewal API is not okay: ",
        await response.text()
      );
      return false;
    }

    return true;
  } catch (error) {
    console.error("Error sending renewal notification:", error);
    return false;
  }
}

async function handleExpiration(payload: RevenueCatNotificationPayload) {
  const expirationApiRoute = internalAPIRoutes.payment.successOnExpiration;
  const expirationApiKey = keys.SUBSCRIPTIONS.EXPIRATION_API_KEY;

  console.log("Payload from expiration type: ", payload);

  try {
    const response = await fetch(expirationApiRoute, {
      headers: {
        "authorization": expirationApiKey,
        "Content-Type": "application/json",
      },
      method: "POST",
      body: JSON.stringify({
        productId: payload.product_id,
        periodType: payload.period_type,
        purchasedTs: payload.purchased_at_ms,
        expirationTs: payload.expiration_at_ms,
        store: payload.store,
        environment: payload.environment,
        countryCode: payload.country_code,
        customerId: payload.app_user_id,
        transactionId: payload.transaction_id,
        offerCode: payload.offer_code || "",
        ts: payload.event_timestamp_ms,
        price: payload.price,
        priceInPurchasedCurrency: payload.price_in_purchased_currency,
        currency: payload.currency,
      }),
    });

    if (!response.ok) {
      console.error(
        "Response from expiration API is not okay: ",
        await response.text()
      );
      return false;
    }

    return true;
  } catch (error) {
    console.error("Error sending expiration notification:", error);
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
  }

  if (type === "CANCELLATION") {
    const result = await handleRefund(event);
    if (result.status === "failed") {
      res.status(500).send(result.message);
      return;
    }
    res.status(200).send("OK");
    return;
  }

  if (type === "INITIAL_PURCHASE") {
    const result = await handleInitialPurchase(event);
    if (!result) {
      res.status(500).send("Internal Server Error");
      return;
    }
    res.status(200).send("OK");
    return;
  }

  if (type === "RENEWAL") {
    const result = await handleRenewal(event);
    if (!result) {
      res.status(500).send("Internal Server Error");
      return;
    }
    res.status(200).send("OK");
    return;
  }

  if (type === "EXPIRATION") {
    const result = await handleExpiration(event);
    if (!result) {
      res.status(500).send("Internal Server Error");
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
