import {defineString} from "firebase-functions/params";

const userAPIsBaseURLParam = defineString("USER_APIS_BASE_URL");

// Create a function that returns the routes with the current baseURL
const getInternalAPIRoutes = (baseUrl: string) => ({
  notification: {
    sendNotification: `${baseUrl}/user-Notification-sendNotification`,
    deleteNotification: `${baseUrl}/user-Notification-deleteNotification`,
  },
  payment: {
    successonPayment: `${baseUrl}/payment-successOnPayment`,
    refund: `${baseUrl}/payment-refund`,
  },
  identity: {
    handleCreatedVerification: `${baseUrl}/identity-handleCreatedVerification`,
    handleProcessingVerification: `${baseUrl}/identity-handleProcessingVerification`,
    handleReuqiresInputVerification: `${baseUrl}/identity-handleRequiresInputVerification`,
    handleSuccessfulVerification: `${baseUrl}/identity-handleSuccessfulVerification`,
  },
});

// Export a function to get the routes instead of the routes directly
export const getRoutes = () => {
  const userApisBaseUrl = userAPIsBaseURLParam.value();

  if (!userApisBaseUrl) {
    throw new Error("User APIs Base URL is undefined from function params.");
  }

  return getInternalAPIRoutes(userApisBaseUrl);
};
