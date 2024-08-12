import {onRequest} from "firebase-functions/v2/https";
import {keys} from "../../config";
import {firestore} from "../../firebase/adminApp";
import {UserIdentityDoc} from "../../types/Identity";

import Stripe from "stripe";
const stripe = new Stripe(keys.IDENTITY.STRIPE_RESTRICTED_API_KEY);

function handleAuthorization(key: string | undefined) {
  if (key === undefined) {
    console.error("Unauthorized attemp to successOnPayment API.");
    return false;
  }

  return key === keys.IDENTITY.HANDLE_SUCCESSFUL_VERIFICATION_API_KEY;
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
            "verified_outputs",
            "verified_outputs.dob",
            "verified_outputs.id_number",
          ],
        }
      );

    console.log("Verification Session: ", verificationSession);

    const verifiedOutputs = verificationSession.verified_outputs;

    if (!verifiedOutputs) {
      console.error("No verified outputs");
      return false;
    }

    const firstName = verifiedOutputs.first_name || "";
    const lastName = verifiedOutputs.last_name || "";
    const dateOfBirth = verifiedOutputs.dob?.year || 0;
    const idNumber = verifiedOutputs.id_number || "";

    if (!firstName || !lastName || !dateOfBirth || !idNumber) {
      console.error("Missing verified outputs");
      return false;
    }

    return {
      firstName,
      lastName,
      dateOfBirth,
      idNumber,
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
  firstName: string,
  lastName: string,
  dateOfBirth: number,
  idNumber: string
) {
  const identityDocRef = firestore.doc(`users/${username}/personal/identity`);

  const data: UserIdentityDoc = {
    id,
    created,
    status: "verified",
    livemode,
    firstName,
    lastName,
    dateOfBirth,
    idNumber,
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
    identityDetails.firstName,
    identityDetails.lastName,
    identityDetails.dateOfBirth,
    identityDetails.idNumber
  );
  if (!updateUserIdentitynDocResult) {
    res.status(500).send("Internal Server Error");
    return;
  }

  res.status(200).send("OK");
  return;
});
