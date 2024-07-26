import { onRequest } from "firebase-functions/v2/https";
import { appCheckMiddleware } from "../../../../middleware/appCheckMiddleware";
import { auth, firestore } from "../../../../firebase/adminApp";

function checkProps(email: string, password: string, verificationCode: number) {
  if (!email || !password || !verificationCode) return false;

  const emailRegex =
    /^[a-zA-Z0-9._%+-]+@(gmail\.com|icloud\.com|yahoo\.com|outlook\.com)$/i;
  const emailRegexTestResult = emailRegex.test(email);

  if (!emailRegexTestResult) {
    console.error("Email is not valid");
    return false;
  }

  const minLengthCase = password.length >= 8;
  const hasLowerCase = /[a-z]/.test(password);
  const hasUpperCase = /[A-Z]/.test(password);
  const hasDigit = /\d/.test(password);

  if (minLengthCase && hasLowerCase && hasUpperCase && hasDigit) return true;

  console.error("Password is not valid");
  return false;
}

async function isEmailUnique(email: string) {
  try {
    await auth.getUserByEmail(email);
    console.error("Email is already taken");
    return false;
  } catch (error) {
    console.log("Email is unique");
    return true;
  }
}

async function checkVerificationCode(email: string, verificationCode: number) {
  try {
    const verificationDocRef = firestore.doc(`emailVerifications/${email}`);

    const verificationDocSnapshot = await verificationDocRef.get();

    if (!verificationDocSnapshot.exists) {
      console.error("Verification doc does not exist");
      return false;
    }

    const data = verificationDocSnapshot.data() as { code: number };

    if (!data) {
      console.error("Verification doc data is undefined");
      return false;
    }

    const codeString = data.code.toString();
    const verificationCodeString = verificationCode.toString();

    const verifyResult = codeString === verificationCodeString;

    if (verifyResult) await verificationDocRef.delete();

    return verifyResult;
  } catch (error) {
    console.error("Error checking verification code", error);
    return false;
  }
}

async function createAuthObject(email: string, password: string) {
  try {
    await auth.createUser({
      email: email,
      password: password,
      emailVerified: true,
    });

    return true;
  } catch (error) {
    console.error("Error creating auth object", error);
    return false;
  }
}

export const verifyEmail = onRequest(
  appCheckMiddleware(async (req, res) => {
    const { email, password, verificationCode } = req.body;

    const checkPropResult = checkProps(email, password, verificationCode);
    if (!checkPropResult) {
      res.status(422).send("Invalid props.");
      return;
    }

    const emailUnique = await isEmailUnique(email);
    if (!emailUnique) {
      res.status(422).send("Email is already taken.");
      return;
    }

    const checkVerificationCodeResult = await checkVerificationCode(
      email,
      verificationCode
    );
    if (!checkVerificationCodeResult) {
      res.status(422).send("Verification code is invalid.");
      return;
    }

    const createAuthObjectResult = await createAuthObject(email, password);
    if (!createAuthObjectResult) {
      res.status(500).send("Internal server error.");
      return;
    }

    res.status(200).send("OK");

    return;
  })
);
