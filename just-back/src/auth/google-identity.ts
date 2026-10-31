import { getApps, initializeApp, cert, type App } from "firebase-admin/app";
import {readFileSync} from "node:fs";
import {z} from "zod";
import { getAuth, type DecodedIdToken } from "firebase-admin/auth";
import type { Config } from "../config/env.js";
import { fail } from "../common/errors.js";
import { User } from "./models.js";

export function googleFailureCode(error:unknown){
  const code=typeof error==="object" && error && "code" in error ? error.code : undefined;
  const allowed=["auth/invalid-credential","app/invalid-credential","auth/insufficient-permission","auth/project-not-found","auth/invalid-id-token","auth/argument-error","auth/id-token-expired","auth/id-token-revoked","auth/user-disabled","auth/certificate-fetch-failed","auth/internal-error"];
  return typeof code==="string" && allowed.includes(code) ? code : "verification_unavailable";
}
export function googleAdmin(config:Config):App{
  const existing=getApps().find(app=>app.name==="jpi-auth");if(existing)return existing;
  try{
    const credentials=z.object({type:z.literal("service_account"),project_id:z.string(),client_email:z.email(),private_key:z.string().startsWith("-----BEGIN PRIVATE KEY-----")}).parse(JSON.parse(readFileSync(config.GOOGLE_APPLICATION_CREDENTIALS!,"utf8")));
    if(credentials.project_id!==config.FIREBASE_PROJECT_ID)throw new Error("Project mismatch");
    return initializeApp({credential:cert({projectId:credentials.project_id,clientEmail:credentials.client_email,privateKey:credentials.private_key}),projectId:config.FIREBASE_PROJECT_ID},"jpi-auth");
  }catch{
    console.warn(JSON.stringify({event:"google_verification_failure",category:"admin_credential_configuration"}));
    fail(503,"GOOGLE_UNAVAILABLE","Google sign-in configuration needs attention. Use phone and password for now.");
  }
}

export function googleClaims(claims: DecodedIdToken, now = Date.now()) {
  if (claims.firebase?.sign_in_provider !== "google.com" || claims.email_verified !== true || !claims.email || !claims.uid || !claims.auth_time || now / 1000 - claims.auth_time > 600 || claims.auth_time > now / 1000 + 60)
    fail(401,"GOOGLE_INVALID","Sign in with Google again to continue.");
  return { email: claims.email.trim().toLowerCase(), googleUid: claims.uid };
}
export async function verifyGoogle(token:string,config:Config) {
  if(!config.GOOGLE_SIGN_IN_ENABLED || !config.FIREBASE_PROJECT_ID) fail(503,"GOOGLE_UNAVAILABLE","Google sign-in is not available yet.");
  const indexes=await User.collection.indexes();
  if(!indexes.some(index=>index.unique && index.key.googleUid===1 && index.partialFilterExpression?.googleUid?.$type==="string")) fail(503,"GOOGLE_UNAVAILABLE","Google sign-in setup is not complete.");
  const app=googleAdmin(config);
  let claims:DecodedIdToken;
  try { claims=await getAuth(app).verifyIdToken(token,true); }
  catch(error) {
    const category=googleFailureCode(error);
    console.warn(JSON.stringify({event:"google_verification_failure",category}));
    if(["auth/invalid-credential","app/invalid-credential","auth/insufficient-permission","auth/project-not-found","auth/certificate-fetch-failed","auth/internal-error","verification_unavailable"].includes(category))fail(503,"GOOGLE_UNAVAILABLE","Google verification is temporarily unavailable. Use phone and password for now.");
    fail(401,"GOOGLE_INVALID","Google verification failed. Sign in with Google again.");
  }
  return googleClaims(claims);
}
