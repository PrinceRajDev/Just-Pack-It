/** Self-contained transactional email: readable with images and external fonts blocked. */
export function otpEmail(code: string, purpose = "signup") {
  if (!/^\d{6}$/.test(code)) throw new Error("Expected a six-digit email code");
  const recovery = purpose === "recovery";
  const title = recovery ? "Reset your password" : "A little closer to your local market.";
  const instruction = recovery
    ? "Enter this code on Just Pack It to continue resetting your password."
    : "Welcome to Just Pack It. Enter this code on the signup page to verify your email and continue creating your account.";
  const action = recovery ? "password reset" : "signup";
  return {
    subject: recovery ? "Just Pack It — reset your password" : "Your verification code — Just Pack It",
    textContent: `Just Pack It\nYour neighbourhood, delivered.\n\n${recovery ? title : "Verify your email"}\n${instruction}\n\nYour code: ${code}\nValid for 10 minutes. Use the latest code if you request another.\n\nKeep this code private. Our team will never ask you to share it. If you did not request ${action}, ignore this email.\n\nJust Pack It`,
    htmlContent: `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="color-scheme" content="light"><title>${recovery ? title : "Verify your email"}</title></head>
<body style="margin:0;padding:0;background-color:#f7f4ec;color:#183d2e;font-family:Arial,Helvetica,sans-serif;">
<div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;">${recovery ? "Continue your password reset" : "Verify your email to get started"}. Your code is valid for 10 minutes.</div>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:#f7f4ec;"><tr><td align="center" style="padding:32px 12px;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:560px;background-color:#fffdf8;border:1px solid #e2dfd4;border-radius:20px;overflow:hidden;">
<tr><td style="padding:28px 28px 24px;background-color:#123f2e;border-bottom:6px solid #c5eb78;">
<p style="margin:0;color:#f9f8ef;font-size:28px;font-weight:800;letter-spacing:-1px;">just pack it<span style="color:#c5eb78;">.</span></p>
<p style="margin:8px 0 0;color:#e0ebd8;font-size:13px;line-height:20px;">Your neighbourhood, delivered.</p></td></tr>
<tr><td style="padding:32px 28px;">
<p style="margin:0 0 14px;color:#45664d;font-size:12px;font-weight:bold;letter-spacing:1.5px;">${recovery ? "ACCOUNT SECURITY" : "WELCOME TO THE NEIGHBOURHOOD"}</p>
<h1 style="margin:0 0 18px;color:#123f2e;font-family:Georgia,'Times New Roman',serif;font-size:30px;line-height:38px;font-weight:bold;">${title}</h1>
<p style="margin:0 0 24px;color:#526054;font-size:16px;line-height:25px;">${instruction}</p>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:#eef4e3;border:1px solid #d9e4cb;border-radius:12px;"><tr><td align="center" style="padding:22px 8px;">
<p style="margin:0 0 12px;color:#45664d;font-size:14px;line-height:20px;">Your ${recovery ? "reset" : "verification"} code</p>
<p dir="ltr" style="margin:0;color:#123f2e;font-family:'Courier New',monospace;font-size:34px;font-weight:bold;letter-spacing:5px;line-height:44px;">${code}</p>
<p style="margin:10px 0 0;color:#526054;font-size:13px;line-height:20px;">Valid for 10 minutes</p></td></tr></table>
<p style="margin:20px 0 0;color:#526054;font-size:14px;line-height:23px;">Keep this code private. Our team will never ask you to share it. Requested another code? Use the latest one.</p>
<p style="margin:18px 0 0;color:#526054;font-size:14px;line-height:23px;">If you didn’t request ${action}, you can safely ignore this email.</p>
</td></tr>
<tr><td style="padding:22px 28px;border-top:1px solid #e2dfd4;background-color:#faf8f0;">
<p style="margin:0;color:#123f2e;font-size:14px;font-weight:bold;line-height:22px;">Local shops. Real people.</p>
<p style="margin:4px 0 0;color:#657160;font-size:12px;line-height:20px;">An account security email from Just Pack It.</p>
</td></tr></table></td></tr></table></body></html>`,
  };
}
