import * as admin from "firebase-admin";

import {
  keys,
  environment,
  serviceAccounts,
  storageBucketIds,
} from "../config";

if (!admin.apps.length) {
  const serviceAccount =
    environment === "development" || environment === "localPreview" ?
      (serviceAccounts.developmentAndLocalPreviewAccount as admin.ServiceAccount) :
      (keys.SERVICE_ACCOUNT_OBJECT as admin.ServiceAccount);

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
    keys.STORAGE_BUCKET_ID;

export const bucket = admin.storage().bucket(storageBucketId);
