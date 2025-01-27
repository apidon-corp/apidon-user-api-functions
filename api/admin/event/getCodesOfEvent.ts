import {firestore} from "../../../firebase/adminApp";
import {onRequest} from "firebase-functions/https";
import {CodeDocData} from "../../../types/Collectible";
import {handleAdminAuthorization} from "../../../helpers/handleAdminAuthorization";

function checkProps(collectibleDocPath: string) {
  if (!collectibleDocPath) {
    console.error("Collectible doc path is missing");
    return false;
  }
  return true;
}

async function getCodes(collectibleDocPath: string) {
  try {
    const query = await firestore
      .collection("collectibleCodes")
      .where("collectibleDocPath", "==", collectibleDocPath)
      .get();

    return query.docs.map((doc) => doc.data() as CodeDocData);
  } catch (error) {
    console.error("Error on getting codes of event: ", error);
    return false;
  }
}

export const getCodesOfEvent = onRequest(async (req, res) => {
  const {authorization} = req.headers;
  const {collectibleDocPath} = req.body;

  if (!(await handleAdminAuthorization(authorization))) {
    res.status(401).send("Unauthorized");
    return;
  }
  if (!checkProps(collectibleDocPath)) {
    res.status(422).send("Invalid Props");
    return;
  }
  const codes = await getCodes(collectibleDocPath);
  if (!codes) {
    res.status(500).send("Internal Server Error");
    return;
  }
  res.status(200).send({
    codes: codes,
  });
});
