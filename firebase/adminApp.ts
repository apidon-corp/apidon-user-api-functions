import {initializeApp} from "firebase-admin/app";
import {getAppCheck} from "firebase-admin/app-check";
import {getAuth} from "firebase-admin/auth";
import {getFirestore} from "firebase-admin/firestore";
import {getStorage} from "firebase-admin/storage";

const app = initializeApp();

export const auth = getAuth(app);
export const firestore = getFirestore(app);
export const appCheck = getAppCheck(app);
export const bucket = getStorage(app).bucket();
