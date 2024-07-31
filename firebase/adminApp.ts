import * as admin from "firebase-admin";

import {environment, serviceAccounts, storageBucketIds} from "../config";

if (!admin.apps.length) {
  const serviceAccount =
    environment === "development" || environment === "localPreview" ?
      (serviceAccounts.developmentAndLocalPreviewAccount as admin.ServiceAccount) :
      environment === "preview" ?
        (serviceAccounts.testAccount as admin.ServiceAccount) :
        (serviceAccounts.developmentAndLocalPreviewAccount as admin.ServiceAccount);

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

export const auth = admin.auth();
export const firestore = admin.firestore();

export const appCheck = admin.appCheck();

const storageBucketId =
  environment === "development" || environment === "localPreview" ?
    storageBucketIds.developmentAndLocalPreviewAccount :
    environment === "preview" ?
      storageBucketIds.testAccount :
      storageBucketIds.developmentAndLocalPreviewAccount;

export const bucket = admin.storage().bucket(storageBucketId);
