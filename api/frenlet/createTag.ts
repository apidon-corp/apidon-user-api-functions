import {onRequest} from "firebase-functions/v2/https";

import getDisplayName from "../../helpers/getDisplayName";
import {firestore} from "../../firebase/adminApp";

import {FieldValue as fieldValue} from "firebase-admin/firestore";

async function handleAuthorization(key: string | undefined) {
  if (key === undefined) {
    console.error("Unauthorized attemp to integrateModel API.");
    return false;
  }

  const operationFromUsername = await getDisplayName(key);
  if (!operationFromUsername) return false;

  return operationFromUsername;
}

function checkProps(tag: string) {
  if (!tag) {
    console.error("Tag is undefined.");
    return false;
  }

  if (tag.length > 10 || tag.length === 0 || tag.includes(" ")) return false;

  return true;
}

async function createTagMethod(tag: string, username: string) {
  try {
    const frenletsDoc = firestore.doc(`/users/${username}/frenlets/frenlets`);
    await frenletsDoc.update({
      tags: fieldValue.arrayUnion(tag),
    });
    return true;
  } catch (error) {
    console.error("Error while creating tag: \n", error);
    return false;
  }
}

export const createTag = onRequest(async (req, res) => {
  const {authorization} = req.headers;
  const {tag} = req.body;

  const username = await handleAuthorization(authorization);
  if (!username) {
    res.status(401).send("Unauthorized");
    return;
  }

  const checkPropsResult = checkProps(tag);
  if (!checkPropsResult) {
    res.status(500).send("Internal Server Error");
    return;
  }

  const createTagResult = await createTagMethod(tag, username);
  if (!createTagResult) {
    res.status(500).send("Internal Server Error");
    return;
  }

  res.status(200).send("OK");
  return;
});
