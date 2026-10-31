import { z } from "zod";
import { name } from "../common/validation.js";
import {emailProofFields} from "./email-otp.js";
export const phone = z.string().regex(/^\+[1-9]\d{9,14}$/);
export const password = z.string().min(12).max(128);
export const registerInput = z.object({ name, phone, password,...emailProofFields }).strict();
export const loginInput = z.object({ phone, password }).strict();
