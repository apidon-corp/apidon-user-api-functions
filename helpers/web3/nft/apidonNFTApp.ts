import { ethers } from "ethers";

import { apidonNFTContract } from "./ApidonNFTContract";
import { keys } from "../../../config";

export const apidonNFTSepoliaContractAddress = keys.APIDON_NFT_CONTRACT_ADDRESS;

const provider = new ethers.JsonRpcProvider(keys.ALCHEMY_SEPOLIA_URL_ENDPOINT);

const walletPrivateAddress = keys.WEB3_PRIVATE_WALLET_ADDRESS;
const wallet = new ethers.Wallet(walletPrivateAddress, provider);

export const apidonNFT = new ethers.Contract(
  apidonNFTSepoliaContractAddress,
  apidonNFTContract.abi,
  wallet
);
