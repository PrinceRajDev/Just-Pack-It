import { getApps, initializeApp, applicationDefault } from "firebase-admin/app";
import { getAuth, type DecodedIdToken } from "firebase-admin/auth";
import type { Config } from "../config/env.js";
import { fail } from "../common/errors.js";
import { User } from "./models.js";

export function googleClaims(claims: DecodedIdToken, now = Date.now()) {
  if (claims.firebase?.sign_in_provider !== "google.com" || claims.email_verified !== true || !claims.email || !claims.uid || !claims.auth_time || now / 1000 - claims.auth_time > 600 || claims.auth_time > now / 1000 + 60)
    fail(401,"GOOGLE_INVALID","Sign in with Google again to continue.");
  return { email: claims.email.trim().toLowerCase(), googleUid: claims.uid };
}
export async function verifyGoogle(token:string,config:Config) {
  if(!config.GOOGLE_SIGN_IN_ENABLED || !config.FIREBASE_PROJECT_ID) fail(503,"GOOGLE_UNAVAILABLE","Google sign-in is not available yet.");
  const indexes=await User.collection.indexes();
  if(!indexes.some(index=>index.unique && index.key.googleUid===1 && index.partialFilterExpression?.googleUid?.$type==="string")) fail(503,"GOOGLE_UNAVAILABLE","Google sign-in setup is not complete.");
  const app=getApps().find(app=>app.name==="jpi-auth") ?? initializeApp({credential:applicationDefault(),projectId:config.FIREBASE_PROJECT_ID},"jpi-auth");
  let claims:DecodedIdToken;
  try { claims=await getAuth(app).verifyIdToken(token,true); }
  catch { fail(401,"GOOGLE_INVALID","Google verification failed. Sign in with Google again."); }
  return googleClaims(claims);
}
