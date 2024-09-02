import * as admin from "firebase-admin";

import {getConfigObject} from "../configs/getConfigObject";

const configObject = getConfigObject();
if (!configObject) throw new Error("Config object not found for admin app.");

if (!admin.apps.length) {
  const serviceAccount = configObject.serviceAccount as admin.ServiceAccount;

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

export const auth = admin.auth();
export const firestore = admin.firestore();

export const appCheck = admin.appCheck();

const storageBucketId = configObject.storageBucketId;

export const bucket = admin.storage().bucket(storageBucketId);
