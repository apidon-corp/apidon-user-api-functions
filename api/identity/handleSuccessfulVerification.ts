import {onRequest} from "firebase-functions/v2/https";
import {firestore} from "../../firebase/adminApp";
import {UserIdentityDoc} from "../../types/Identity";
import {getConfigObject} from "../../configs/getConfigObject";
import Stripe from "stripe";
import {Environment} from "@/types/Admin";

const configObject = getConfigObject();

if (!configObject) {
  throw new Error("Config object is undefined");
}

const stripe = new Stripe(configObject.STRIPE_RESTRICTED_API_KEY);

function handleAuthorization(key: string | undefined) {
  if (key === undefined) {
    console.error("Unauthorized attemp to successOnPayment API.");
    return false;
  }

  if (!configObject) {
    console.error("Config object is undefined");
    return false;
  }

  return key === configObject.HANDLE_SUCCESSFUL_VERIFICATION_API_KEY;
}

function checkProps(
  username: string,
  id: string,
  created: number,
  status: string
) {
  if (!username || !id || !created || !status) {
    return false;
  }

  if (status !== "verified") {
    console.error(
      "Status is not verified. But a request came to handleSuccessfulVerification API."
    );
    return false;
  }

  return true;
}

async function getIdentityDetails(verificationSessionId: string) {
  try {
    const verificationSession =
      await stripe.identity.verificationSessions.retrieve(
        verificationSessionId,
        {
          expand: [
            "verified_outputs.dob",
            "verified_outputs.id_number",
            "last_verification_report.document.number",
          ],
        }
      );

    const lastVerificationReport = verificationSession.last_verification_report;

    if (!lastVerificationReport) {
      console.error(
        "No lastVerificationReport found from verification session"
      );
      return false;
    }

    if (typeof lastVerificationReport === "string") {
      console.error("lastVerificationReport is a string");
      return false;
    }

    const verificationReportId = lastVerificationReport.id;

    const documentData = lastVerificationReport.document;

    if (!documentData) {
      console.error("No document data found");
      return false;
    }

    const firstName = documentData.first_name || "";
    const lastName = documentData.last_name || "";
    const idNumber = documentData.number || "";
    const type = documentData.type || "";
    const issuingCountry = documentData.issuing_country || "";

    const verifiedOutputs = verificationSession.verified_outputs;

    if (!verifiedOutputs) {
      console.error("No verified outputs found");
      return false;
    }

    const dob = verifiedOutputs.dob;
    if (!dob) {
      console.error("No dob found");
      return false;
    }

    const dateOfBirth = `${dob.day}-${dob.month}-${dob.year}` || "";

    if (
      !verificationReportId ||
      !firstName ||
      !lastName ||
      !idNumber ||
      !type ||
      !issuingCountry ||
      !dateOfBirth
    ) {
      console.error("Missing verified outputs");
      return false;
    }

    return {
      verificationReportId,
      firstName,
      lastName,
      idNumber,
      type,
      issuingCountry,
      dateOfBirth,
    };
  } catch (error) {
    console.error("Error on retrieving verification session.", error);
    return false;
  }
}

async function updateUserIdentitynDoc(
  username: string,
  id: string,
  created: number,
  livemode: boolean,
  verificationReportId: string,
  firstName: string,
  lastName: string,
  idNumber: string,
  type: string,
  issuingCountry: string,
  dateOfBirth: string
) {
  const identityDocRef = firestore.doc(`users/${username}/personal/identity`);

  const data: UserIdentityDoc = {
    id,
    created,
    status: "verified",
    livemode,
    verificationReportId,
    firstName,
    lastName,
    idNumber,
    type,
    issuingCountry,
    dateOfBirth,
  };

  try {
    await identityDocRef.set(data);

    return true;
  } catch (error) {
    console.error("Error on updating identity doc.");
    return false;
  }
}

export const handleSuccessfulVerification = onRequest(async (req, res) => {
  const environment = process.env.ENVIRONMENT as Environment;

  if (!environment || environment === "PRODUCTION") {
    res.status(403).send("Forbidden");
    return;
  }

  const {authorization} = req.headers;

  const {username, id, created, status, livemode} = req.body;

  const authResult = handleAuthorization(authorization);
  if (!authResult) {
    res.status(401).send("Unauthorized");
    return;
  }

  if (!checkProps(username, id, created, status)) {
    res.status(422).send("Invalid Request");
    return;
  }

  const identityDetails = await getIdentityDetails(id);
  if (!identityDetails) {
    res.status(500).send("Internal Server Error");
    return;
  }

  const updateUserIdentitynDocResult = await updateUserIdentitynDoc(
    username,
    id,
    created,
    livemode,
    identityDetails.verificationReportId,
    identityDetails.firstName,
    identityDetails.lastName,
    identityDetails.idNumber,
    identityDetails.type,
    identityDetails.issuingCountry,
    identityDetails.dateOfBirth
  );
  if (!updateUserIdentitynDocResult) {
    res.status(500).send("Internal Server Error");
    return;
  }

  res.status(200).send("OK");
  return;
});
