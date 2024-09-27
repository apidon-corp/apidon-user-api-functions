import {ConfigObject, Environment} from "../types/Admin";
import * as path from "path";
import * as fs from "fs";
import * as crypto from "crypto-js";
import * as dotenv from "dotenv";

dotenv.config();

const decryptFile = (filePath: string, encryptionKey: string) => {
  try {
    const encryptedData = fs.readFileSync(filePath, "utf8");

    const bytes = crypto.AES.decrypt(encryptedData, encryptionKey);
    const decryptedData = bytes.toString(crypto.enc.Utf8);

    const decryptedDataJson = JSON.parse(decryptedData) as ConfigObject;
    return decryptedDataJson;
  } catch (error) {
    console.error("Error decrypting file:", error);
    return false;
  }
};

function developmentConfigHandler() {
  const configPath = path.join(__dirname, "developmentConfig.encrypted");

  const developmentConfigFileKey =
    process.env.DEVELOPMENT_CONFIG_FILE_KEY || "";

  if (!developmentConfigFileKey) {
    console.error(
      "DEVELOPMENT_CONFIG_FILE_KEY environment variable is not set."
    );
    return false;
  }

  let decryptedData = decryptFile(configPath, developmentConfigFileKey);

  if (decryptedData) {
    decryptedData = {
      ...decryptedData,
      USER_APIS_BASE_URL: process.env.DEVELOPMENT_USER_PANEL_BASE_URL || "",
    };
  }

  return decryptedData;
}

function localPreviewConfigHandler() {
  const configPath = path.join(__dirname, "localPreviewConfig.encrypted");

  const localPreviewConfigFileKey =
    process.env.LOCAL_PREVIEW_CONFIG_FILE_KEY || "";

  if (!localPreviewConfigFileKey) {
    console.error(
      "LOCAL_PREVIEW_CONFIG_FILE_KEY environment variable is not set."
    );
    return false;
  }

  const decryptedData = decryptFile(configPath, localPreviewConfigFileKey);

  return decryptedData;
}

function previewConfigHandler() {
  const configPath = path.join(__dirname, "previewConfig.encrypted");

  const previewConfigFileKey = process.env.PREVIEW_CONFIG_FILE_KEY || "";

  if (!previewConfigFileKey) {
    console.error("PREVIEW_CONFIG_FILE_KEY environment variable is not set.");
    return false;
  }

  const decryptedData = decryptFile(configPath, previewConfigFileKey);

  return decryptedData;
}

/**
 * Getting right config object according to environment.
 */
export function getConfigObject() {
  const environment = process.env.ENVIRONMENT as Environment;

  if (environment === "DEVELOPMENT") return developmentConfigHandler();
  if (environment === "LOCALPREVIEW") return localPreviewConfigHandler();
  if (environment === "PREVIEW") return previewConfigHandler();

  console.error("Environment not supported");
  return false;
}
