import {getRoutes} from "../../helpers/internalApiRoutes";
import {onRequest} from "firebase-functions/https";
import {RevenueCatNotificationPayload} from "../../types/IAP";
import {isProduction} from "../../helpers/projectVersioning";
import {defineSecret} from "firebase-functions/params";

const revenueCatWebhookAuthKeySecret = defineSecret(
  "REVENUE_CAT_WEBHOOK_AUTH_KEY"
);
const successOnPaymentAPIAuthKeySecret = defineSecret(
  "SUCCESS_ON_PAYMENT_API_AUTH_KEY"
);

const refundAPIAuthKeySecret = defineSecret("REFUND_API_AUTH_KEY");

function handleAuthorization(
  authorization: string | undefined,
  revenueCatWebhookAuthKey: string
) {
  if (!authorization) {
    console.error("Authorization header is missing");
    return false;
  }

  return {
    authResult: authorization === revenueCatWebhookAuthKey,
  };
}

function getTypeOfNotification(payload: RevenueCatNotificationPayload) {
  const type = payload.type;
  return type;
}

async function handleSuccessfullPayment(
  payload: RevenueCatNotificationPayload,
  successonPaymentAPIAuthKey: string
) {
  const successOnPaymentAPIRoute = getRoutes().payment.successonPayment;
  const apiKey = successonPaymentAPIAuthKey;

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

async function handleRefund(
  payload: RevenueCatNotificationPayload,
  refundAPIAuthKey: string
) {
  const refundApiRoute = getRoutes().payment.refund;
  const refundApiKey = refundAPIAuthKey;

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

export const paymentNotificationHandler = onRequest(
  {
    secrets: [
      revenueCatWebhookAuthKeySecret,
      successOnPaymentAPIAuthKeySecret,
      refundAPIAuthKeySecret,
    ],
  },
  async (req, res) => {
    if (isProduction()) {
      res.status(403).send("Forbidden");
      return;
    }

    const {authorization} = req.headers;

    const {event} = req.body;

    const authResult = handleAuthorization(
      authorization,
      revenueCatWebhookAuthKeySecret.value()
    );
    if (!authResult || !authResult.authResult) {
      res.status(401).send("Unauthorized");
      return;
    }

    const type = getTypeOfNotification(event);

    if (type === "NON_RENEWING_PURCHASE") {
      const result = await handleSuccessfullPayment(
        event,
        successOnPaymentAPIAuthKeySecret.value()
      );
      if (!result) {
        res.status(500).send("Internal Server Error");
        return;
      }
      res.status(200).send("OK");
      return;
    }

    if (type === "CANCELLATION") {
      const result = await handleRefund(event, refundAPIAuthKeySecret.value());
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
  }
);
