import * as admin from "firebase-admin";

import { keys } from "../config";

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(
      keys.SERVICE_ACCOUNT_OBJECT as admin.ServiceAccount
    ),
  });
}

export const auth = admin.auth();
export const firestore = admin.firestore();

export const appCheck = admin.appCheck();

const storageBucketId = keys.STORAGE_BUCKET_ID;

export const bucket = admin.storage().bucket(storageBucketId);
