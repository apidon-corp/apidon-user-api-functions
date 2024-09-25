import {getConfigObject} from "../configs/getConfigObject";

const configObject = getConfigObject();

if (!configObject) {
  throw new Error("Config object is undefined to use for internalAPIRoutes.");
}

const userApisBaseUrl = configObject.USER_APIS_BASE_URL;

if (!userApisBaseUrl) {
  throw new Error("User APIs Base URL is undefined. on configObject");
}

export const internalAPIRoutes = {
  notification: {
    sendNotification: `${userApisBaseUrl}/user-Notification-sendNotification`,
    deleteNotification: `${userApisBaseUrl}/user-Notification-deleteNotification`,
  },
  payment: {
    successonPayment: `${userApisBaseUrl}/payment-successOnPayment`,
    refund: `${userApisBaseUrl}/payment-refund`,
  },
  identity: {
    handleCreatedVerification: `${userApisBaseUrl}/identity-handleCreatedVerification`,
    handleProcessingVerification: `${userApisBaseUrl}/identity-handleProcessingVerification`,
    handleReuqiresInputVerification: `${userApisBaseUrl}/identity-handleRequiresInputVerification`,
    handleSuccessfulVerification: `${userApisBaseUrl}/identity-handleSuccessfulVerification`,
  },
};
