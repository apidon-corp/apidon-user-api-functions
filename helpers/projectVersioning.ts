import {projectID} from "firebase-functions/params";

type ProjectId = "apidon-dev" | "apidon-test" | "apidon-prod";

function getProjectId() {
  return projectID.value() as ProjectId;
}

function isProduction() {
  return getProjectId() === "apidon-prod";
}

function isTest() {
  return getProjectId() === "apidon-test";
}

function isDevelopment() {
  return getProjectId() === "apidon-dev";
}

function isEmulator() {
  return process.env.FUNCTIONS_EMULATOR === "true";
}

export {getProjectId, isProduction, isTest, isDevelopment, isEmulator};
