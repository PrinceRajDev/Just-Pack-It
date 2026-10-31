// DEMO admin data. Clearly labelled in UI; no production metrics.
export const sellerApplications = [
  {
    id: "ap1",
    shop: "Annapurna Sweets",
    owner: "Kavita Joshi",
    locality: "Sector 22",
    category: "Sweets & snacks",
    submitted: "2 days ago",
    docs: "FSSAI, GST",
    status: "pending",
  },
  {
    id: "ap2",
    shop: "Fresh Fold Laundry Supplies",
    owner: "Arjun Mehta",
    locality: "Udyog Vihar",
    category: "Household",
    submitted: "5 days ago",
    docs: "GST missing",
    status: "pending",
  },
  {
    id: "ap3",
    shop: "Gokul Dairy",
    owner: "Mohan Yadav",
    locality: "Block C",
    category: "Dairy",
    submitted: "3 weeks ago",
    docs: "FSSAI, GST",
    status: "approved",
  },
];
export const riders = [
  { id: "r1", name: "Imran K.", zone: "Sector 21", status: "approved", vehicle: "Scooter" },
  { id: "r2", name: "Sunil D.", zone: "Sector 21", status: "pending", vehicle: "Bicycle" },
];
export const disputes = [
  {
    id: "d1",
    order: "JPI-10421-A",
    type: "Missing item",
    raisedBy: "Ananya R.",
    age: "3h",
    status: "open",
  },
  {
    id: "d2",
    order: "JPI-10388-A",
    type: "Refund status",
    raisedBy: "Dev M.",
    age: "1d",
    status: "open",
  },
  {
    id: "d3",
    order: "JPI-10377-B",
    type: "Late delivery",
    raisedBy: "Sana Q.",
    age: "4d",
    status: "resolved",
  },
];
export const audit = [
  { at: "10:42", who: "ops.admin", what: "Approved seller Gokul Dairy" },
  { at: "09:15", who: "ops.admin", what: "Disabled service area DLF Phase 2" },
  { at: "Yesterday", who: "system", what: "Auto-cancelled JPI-10388-A (seller timeout)" },
];
export const coupons = [
  { code: "PILOT50", desc: "₹50 off first order above ₹299", status: "active", funded: "Platform" },
  { code: "CHAI10", desc: "10% off Chai Patti House", status: "active", funded: "Seller" },
];
