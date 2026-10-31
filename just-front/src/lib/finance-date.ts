export const financeDate = (value?: string | null) =>
  value ? new Date(value).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }) : "Not recorded";
