// DEMO DATA — NOT PRODUCTION. Frontend-only typed fixtures for M1V-0A.
// Dual-channel model: the customer only ever talks to Borvat, and the seller
// only ever talks to Borvat. There is no direct customer <-> seller channel.

export type DemoChannel = "customer_borvat" | "borvat_merchant";

export type DemoMessage = {
  id: string;
  conversationId: string;
  author: "customer" | "borvat_agent" | "merchant";
  authorLabel: string;
  at: string;
  body: string;
  attachment?: { name: string; sizeKb: number };
};

export type DemoConversation = {
  id: string;
  channel: DemoChannel;
  caseId: string;
  subject: string;
  /** Customer-side display name (customer channel) or store name (merchant channel). */
  participantLabel: string;
  storeId?: string;
  status: "open" | "waiting_merchant" | "waiting_customer" | "resolved";
  unread: number;
  lastActivity: string;
  assignee?: string;
  /** Human-readable SLA remaining, e.g. "2h 10m". */
  sla?: string;
  slaBreached?: boolean;
  tags?: string[];
};

export type DemoCase = {
  id: string;
  title: string;
  type: "shipping_issue" | "product_question" | "quote_followup" | "return" | "dispute";
  status: "open" | "waiting_merchant" | "waiting_customer" | "resolved";
  priority: "low" | "normal" | "high";
  openedAt: string;
  customerConversationId: string;
  merchantConversationId: string | null;
  links: {
    productId?: string;
    quoteRequestId?: string;
    quoteOfferId?: string;
    orderPlaceholder?: string;
    returnPlaceholder?: string;
  };
  summary: string;
};

export const demoCases: DemoCase[] = [
  {
    id: "case_1001",
    title: "Delivery to second floor — sofa set",
    type: "shipping_issue",
    status: "waiting_customer",
    priority: "high",
    openedAt: "2026-07-24 08:52",
    customerConversationId: "cnv_c1",
    merchantConversationId: "cnv_m1",
    links: {
      productId: "prd_002",
      quoteRequestId: "mqr_002",
      quoteOfferId: "off_003",
      orderPlaceholder: "ORDER-PLACEHOLDER-0001",
    },
    summary:
      "Customer asks whether the sofa set can be carried to the second floor. Borvat checked this separately with the seller.",
  },
  {
    id: "case_1002",
    title: "Pallet quote expired — dining table",
    type: "quote_followup",
    status: "open",
    priority: "normal",
    openedAt: "2026-07-24 10:05",
    customerConversationId: "cnv_c2",
    merchantConversationId: "cnv_m2",
    links: { productId: "prd_001", quoteRequestId: "mqr_001", quoteOfferId: "off_002" },
    summary: "First offer expired; revised offer v2 with tailgate lift is ready.",
  },
  {
    id: "case_1003",
    title: "Dimension question — wall cabinet",
    type: "product_question",
    status: "resolved",
    priority: "low",
    openedAt: "2026-07-19 13:20",
    customerConversationId: "cnv_c3",
    merchantConversationId: null,
    links: { productId: "prd_003" },
    summary: "Answered by Borvat from the product specification; seller not required.",
  },
  {
    id: "case_1004",
    title: "Damaged pallet on delivery",
    type: "shipping_issue",
    status: "open",
    priority: "high",
    openedAt: "2026-07-26 08:14",
    customerConversationId: "cnv_c1004",
    merchantConversationId: "cnv_m1004",
    links: { productId: "prd_001" },
    summary: "A corner of the table top arrived damaged.",
  },
  {
    id: "case_1005",
    title: "Return — bouclé chairs (set of 2)",
    type: "return",
    status: "waiting_merchant",
    priority: "normal",
    openedAt: "2026-07-25 16:02",
    customerConversationId: "cnv_c1005",
    merchantConversationId: "cnv_m1005",
    links: { productId: "prd_002" },
    summary: "Customer wants to return within the cooling-off period; pickup required.",
  },
  {
    id: "case_1006",
    title: "Floor lamp missing power cord",
    type: "product_question",
    status: "open",
    priority: "normal",
    openedAt: "2026-07-26 09:30",
    customerConversationId: "cnv_c1006",
    merchantConversationId: "cnv_m1006",
    links: { productId: "prd_003" },
    summary: "Part missing from the box; replacement shipment requested.",
  },
  {
    id: "case_1007",
    title: "Delivery window exceeded — Belgium",
    type: "shipping_issue",
    status: "waiting_merchant",
    priority: "high",
    openedAt: "2026-07-25 11:20",
    customerConversationId: "cnv_c1007",
    merchantConversationId: "cnv_m1007",
    links: { productId: "prd_004" },
    summary: "Promised 3 working days, now 7 days in transit.",
  },
  {
    id: "case_1008",
    title: "Business invoice requested",
    type: "product_question",
    status: "waiting_customer",
    priority: "low",
    openedAt: "2026-07-24 14:45",
    customerConversationId: "cnv_c1008",
    merchantConversationId: "cnv_m1008",
    links: { productId: "prd_005" },
    summary: "VAT number is still missing from the request.",
  },
  {
    id: "case_1009",
    title: "Dispute over quoted shipping cost",
    type: "dispute",
    status: "open",
    priority: "high",
    openedAt: "2026-07-26 07:05",
    customerConversationId: "cnv_c1009",
    merchantConversationId: "cnv_m1009",
    links: { productId: "prd_006" },
    summary: "Customer believes the tailgate lift was included in v1.",
  },
  {
    id: "case_1010",
    title: "Reschedule delivery appointment",
    type: "shipping_issue",
    status: "resolved",
    priority: "low",
    openedAt: "2026-07-23 10:10",
    customerConversationId: "cnv_c1010",
    merchantConversationId: "cnv_m1010",
    links: { productId: "prd_001" },
    summary: "New delivery day arranged with the carrier.",
  },
];

export const demoConversations: DemoConversation[] = [
  {
    id: "cnv_c1",
    channel: "customer_borvat",
    caseId: "case_1001",
    subject: "Delivery to the second floor?",
    participantLabel: "Sanne D. (customer)",
    status: "waiting_customer",
    unread: 1,
    lastActivity: "2026-07-24 11:40",
  },
  {
    id: "cnv_m1",
    channel: "borvat_merchant",
    caseId: "case_1001",
    subject: "Carry-in service question for VBH-SOF-3AN",
    participantLabel: "Vandenberg Home",
    storeId: "str_001",
    status: "resolved",
    unread: 0,
    lastActivity: "2026-07-24 11:12",
  },
  {
    id: "cnv_c2",
    channel: "customer_borvat",
    caseId: "case_1002",
    subject: "When do I get the shipping price?",
    participantLabel: "Joost K. (customer)",
    status: "open",
    unread: 2,
    lastActivity: "2026-07-25 09:02",
  },
  {
    id: "cnv_m2",
    channel: "borvat_merchant",
    caseId: "case_1002",
    subject: "Revised pallet quote requested",
    participantLabel: "Vandenberg Home",
    storeId: "str_001",
    status: "waiting_merchant",
    unread: 1,
    lastActivity: "2026-07-25 08:30",
  },
  {
    id: "cnv_c3",
    channel: "customer_borvat",
    caseId: "case_1003",
    subject: "Does the wall cabinet fit a 205cm alcove?",
    participantLabel: "Mieke V. (customer)",
    status: "resolved",
    unread: 0,
    lastActivity: "2026-07-19 15:02",
  },
  { id: "cnv_c1004", channel: "customer_borvat", caseId: "case_1004", subject: "Damaged pallet on delivery", participantLabel: "Lars P. (customer)", status: "open", unread: 0, lastActivity: "2026-07-26 08:14", assignee: "Amira H.", sla: "0h 40m", slaBreached: true, tags: ["damage", "pallet"] },
  { id: "cnv_m1004", channel: "borvat_merchant", caseId: "case_1004", subject: "Internal: Damaged pallet on delivery", participantLabel: "Vandenberg Home", storeId: "str_001", status: "open", unread: 1, lastActivity: "2026-07-26 08:14", assignee: "Amira H.", sla: "0h 40m", slaBreached: true, tags: ["damage", "pallet"] },
  { id: "cnv_c1005", channel: "customer_borvat", caseId: "case_1005", subject: "Return — bouclé chairs (set of 2)", participantLabel: "Nadia S. (customer)", status: "waiting_merchant", unread: 1, lastActivity: "2026-07-25 16:02", assignee: "Daan V.", sla: "6h 15m", slaBreached: false, tags: ["return", "pickup"] },
  { id: "cnv_m1005", channel: "borvat_merchant", caseId: "case_1005", subject: "Internal: Return — bouclé chairs (set of 2)", participantLabel: "Vandenberg Home", storeId: "str_001", status: "waiting_merchant", unread: 0, lastActivity: "2026-07-25 16:02", assignee: "Daan V.", sla: "6h 15m", slaBreached: false, tags: ["return", "pickup"] },
  { id: "cnv_c1006", channel: "customer_borvat", caseId: "case_1006", subject: "Floor lamp missing power cord", participantLabel: "Tom B. (customer)", status: "open", unread: 2, lastActivity: "2026-07-26 09:30", assignee: "Sofie L.", sla: "3h 05m", slaBreached: false, tags: ["missing-part"] },
  { id: "cnv_m1006", channel: "borvat_merchant", caseId: "case_1006", subject: "Internal: Floor lamp missing power cord", participantLabel: "Vandenberg Home", storeId: "str_001", status: "open", unread: 1, lastActivity: "2026-07-26 09:30", assignee: "Sofie L.", sla: "3h 05m", slaBreached: false, tags: ["missing-part"] },
  { id: "cnv_c1007", channel: "customer_borvat", caseId: "case_1007", subject: "Delivery window exceeded — Belgium", participantLabel: "Els W. (customer)", status: "waiting_merchant", unread: 0, lastActivity: "2026-07-25 11:20", assignee: "Amira H.", sla: "1h 25m", slaBreached: false, tags: ["sla", "BE"] },
  { id: "cnv_m1007", channel: "borvat_merchant", caseId: "case_1007", subject: "Internal: Delivery window exceeded — Belgium", participantLabel: "Vandenberg Home", storeId: "str_001", status: "waiting_merchant", unread: 0, lastActivity: "2026-07-25 11:20", assignee: "Amira H.", sla: "1h 25m", slaBreached: false, tags: ["sla", "BE"] },
  { id: "cnv_c1008", channel: "customer_borvat", caseId: "case_1008", subject: "Business invoice requested", participantLabel: "Ruben M. (customer)", status: "waiting_customer", unread: 1, lastActivity: "2026-07-24 14:45", assignee: "Daan V.", sla: "18h 00m", slaBreached: false, tags: ["invoice"] },
  { id: "cnv_m1008", channel: "borvat_merchant", caseId: "case_1008", subject: "Internal: Business invoice requested", participantLabel: "Vandenberg Home", storeId: "str_001", status: "waiting_customer", unread: 1, lastActivity: "2026-07-24 14:45", assignee: "Daan V.", sla: "18h 00m", slaBreached: false, tags: ["invoice"] },
  { id: "cnv_c1009", channel: "customer_borvat", caseId: "case_1009", subject: "Dispute over quoted shipping cost", participantLabel: "Fatima J. (customer)", status: "open", unread: 2, lastActivity: "2026-07-26 07:05", assignee: "Sofie L.", sla: "2h 30m", slaBreached: false, tags: ["dispute", "quote"] },
  { id: "cnv_m1009", channel: "borvat_merchant", caseId: "case_1009", subject: "Internal: Dispute over quoted shipping cost", participantLabel: "Vandenberg Home", storeId: "str_001", status: "open", unread: 0, lastActivity: "2026-07-26 07:05", assignee: "Sofie L.", sla: "2h 30m", slaBreached: false, tags: ["dispute", "quote"] },
  { id: "cnv_c1010", channel: "customer_borvat", caseId: "case_1010", subject: "Reschedule delivery appointment", participantLabel: "Peter G. (customer)", status: "resolved", unread: 0, lastActivity: "2026-07-23 10:10", assignee: "Amira H.", sla: "—", slaBreached: false, tags: ["reschedule"] },
  { id: "cnv_m1010", channel: "borvat_merchant", caseId: "case_1010", subject: "Internal: Reschedule delivery appointment", participantLabel: "Vandenberg Home", storeId: "str_001", status: "resolved", unread: 1, lastActivity: "2026-07-23 10:10", assignee: "Amira H.", sla: "—", slaBreached: false, tags: ["reschedule"] },
];

export const demoMessages: DemoMessage[] = [
  // Case 1001 — customer channel
  {
    id: "msg_001",
    conversationId: "cnv_c1",
    author: "customer",
    authorLabel: "Sanne D.",
    at: "2026-07-24 08:52",
    body: "Hello, can the sofa set be carried up to the second floor? There is no lift.",
  },
  {
    id: "msg_002",
    conversationId: "cnv_c1",
    author: "borvat_agent",
    authorLabel: "Borvat Support",
    at: "2026-07-24 09:05",
    body: "Thanks for your question. I am checking this for you and will come back within one working day.",
  },
  {
    id: "msg_003",
    conversationId: "cnv_c1",
    author: "borvat_agent",
    authorLabel: "Borvat Support",
    at: "2026-07-24 11:40",
    body:
      "Good news: delivery up to two floors is possible with a two-person crew. The extra cost is already included in the shipping quote.",
  },
  // Case 1001 — merchant channel (customer never sees this)
  {
    id: "msg_004",
    conversationId: "cnv_m1",
    author: "borvat_agent",
    authorLabel: "Borvat Support",
    at: "2026-07-24 09:07",
    body: "Question on behalf of a customer: is two-person delivery to the second floor possible for VBH-SOF-3AN?",
  },
  {
    id: "msg_005",
    conversationId: "cnv_m1",
    author: "merchant",
    authorLabel: "Vandenberg Home",
    at: "2026-07-24 11:12",
    body: "Yes, up to two floors via our two-person partner. The staircase must be at least 90cm wide.",
  },
  // Case 1002 — customer channel
  {
    id: "msg_006",
    conversationId: "cnv_c2",
    author: "customer",
    authorLabel: "Joost K.",
    at: "2026-07-24 10:05",
    body: "The quote for the dining table expired. Can I get a new price?",
    attachment: { name: "trap-en-oprit.jpg", sizeKb: 412 },
  },
  {
    id: "msg_007",
    conversationId: "cnv_c2",
    author: "borvat_agent",
    authorLabel: "Borvat Support",
    at: "2026-07-24 10:20",
    body: "I am requesting a revised quote. You will receive it in this conversation.",
  },
  {
    id: "msg_008",
    conversationId: "cnv_c2",
    author: "customer",
    authorLabel: "Joost K.",
    at: "2026-07-25 09:02",
    body: "Fine, I will wait. The city centre is hard to reach with a large truck.",
  },
  // Case 1002 — merchant channel
  {
    id: "msg_009",
    conversationId: "cnv_m2",
    author: "borvat_agent",
    authorLabel: "Borvat Support",
    at: "2026-07-25 08:30",
    body: "Offer v1 expired. Please provide a revised pallet quote with tailgate lift for postcode area 3512.",
  },
  // Case 1003 — customer only
  {
    id: "msg_010",
    conversationId: "cnv_c3",
    author: "customer",
    authorLabel: "Mieke V.",
    at: "2026-07-19 13:20",
    body: "Does the 200cm wall cabinet fit into a 205cm alcove?",
  },
  {
    id: "msg_011",
    conversationId: "cnv_c3",
    author: "borvat_agent",
    authorLabel: "Borvat Support",
    at: "2026-07-19 15:02",
    body: "Yes. The outer width is 200.4cm including the finish, so you keep about 4.5cm of clearance.",
  },
  { id: "msg_1004a", conversationId: "cnv_c1004", author: "customer", authorLabel: "Lars P.", at: "2026-07-26 08:14", body: "A corner of the table top arrived damaged." },
  { id: "msg_1004b", conversationId: "cnv_c1004", author: "borvat_agent", authorLabel: "Borvat Support", at: "2026-07-26 08:14", body: "Thanks for your message. We are taking this up with the seller and will get back to you as soon as possible." },
  { id: "msg_1004c", conversationId: "cnv_m1004", author: "borvat_agent", authorLabel: "Borvat Support", at: "2026-07-26 08:14", body: "Request on behalf of a customer: A corner of the table top arrived damaged." },
  { id: "msg_1004d", conversationId: "cnv_m1004", author: "merchant", authorLabel: "Vandenberg Home", at: "2026-07-26 08:14", body: "Received. We are reviewing the case and will respond within the agreed window." },
  { id: "msg_1005a", conversationId: "cnv_c1005", author: "customer", authorLabel: "Nadia S.", at: "2026-07-25 16:02", body: "Customer wants to return within the cooling-off period; pickup required." },
  { id: "msg_1005b", conversationId: "cnv_c1005", author: "borvat_agent", authorLabel: "Borvat Support", at: "2026-07-25 16:02", body: "Thanks for your message. We are taking this up with the seller and will get back to you as soon as possible." },
  { id: "msg_1005c", conversationId: "cnv_m1005", author: "borvat_agent", authorLabel: "Borvat Support", at: "2026-07-25 16:02", body: "Request on behalf of a customer: Customer wants to return within the cooling-off period; pickup required." },
  { id: "msg_1005d", conversationId: "cnv_m1005", author: "merchant", authorLabel: "Vandenberg Home", at: "2026-07-25 16:02", body: "Received. We are reviewing the case and will respond within the agreed window." },
  { id: "msg_1006a", conversationId: "cnv_c1006", author: "customer", authorLabel: "Tom B.", at: "2026-07-26 09:30", body: "Part missing from the box; replacement shipment requested." },
  { id: "msg_1006b", conversationId: "cnv_c1006", author: "borvat_agent", authorLabel: "Borvat Support", at: "2026-07-26 09:30", body: "Thanks for your message. We are taking this up with the seller and will get back to you as soon as possible." },
  { id: "msg_1006c", conversationId: "cnv_m1006", author: "borvat_agent", authorLabel: "Borvat Support", at: "2026-07-26 09:30", body: "Request on behalf of a customer: Part missing from the box; replacement shipment requested." },
  { id: "msg_1006d", conversationId: "cnv_m1006", author: "merchant", authorLabel: "Vandenberg Home", at: "2026-07-26 09:30", body: "Received. We are reviewing the case and will respond within the agreed window." },
  { id: "msg_1007a", conversationId: "cnv_c1007", author: "customer", authorLabel: "Els W.", at: "2026-07-25 11:20", body: "Promised 3 working days, now 7 days in transit." },
  { id: "msg_1007b", conversationId: "cnv_c1007", author: "borvat_agent", authorLabel: "Borvat Support", at: "2026-07-25 11:20", body: "Thanks for your message. We are taking this up with the seller and will get back to you as soon as possible." },
  { id: "msg_1007c", conversationId: "cnv_m1007", author: "borvat_agent", authorLabel: "Borvat Support", at: "2026-07-25 11:20", body: "Request on behalf of a customer: Promised 3 working days, now 7 days in transit." },
  { id: "msg_1007d", conversationId: "cnv_m1007", author: "merchant", authorLabel: "Vandenberg Home", at: "2026-07-25 11:20", body: "Received. We are reviewing the case and will respond within the agreed window." },
  { id: "msg_1008a", conversationId: "cnv_c1008", author: "customer", authorLabel: "Ruben M.", at: "2026-07-24 14:45", body: "VAT number is still missing from the request." },
  { id: "msg_1008b", conversationId: "cnv_c1008", author: "borvat_agent", authorLabel: "Borvat Support", at: "2026-07-24 14:45", body: "Thanks for your message. We are taking this up with the seller and will get back to you as soon as possible." },
  { id: "msg_1008c", conversationId: "cnv_m1008", author: "borvat_agent", authorLabel: "Borvat Support", at: "2026-07-24 14:45", body: "Request on behalf of a customer: VAT number is still missing from the request." },
  { id: "msg_1008d", conversationId: "cnv_m1008", author: "merchant", authorLabel: "Vandenberg Home", at: "2026-07-24 14:45", body: "Received. We are reviewing the case and will respond within the agreed window." },
  { id: "msg_1009a", conversationId: "cnv_c1009", author: "customer", authorLabel: "Fatima J.", at: "2026-07-26 07:05", body: "Customer believes the tailgate lift was included in v1." },
  { id: "msg_1009b", conversationId: "cnv_c1009", author: "borvat_agent", authorLabel: "Borvat Support", at: "2026-07-26 07:05", body: "Thanks for your message. We are taking this up with the seller and will get back to you as soon as possible." },
  { id: "msg_1009c", conversationId: "cnv_m1009", author: "borvat_agent", authorLabel: "Borvat Support", at: "2026-07-26 07:05", body: "Request on behalf of a customer: Customer believes the tailgate lift was included in v1." },
  { id: "msg_1009d", conversationId: "cnv_m1009", author: "merchant", authorLabel: "Vandenberg Home", at: "2026-07-26 07:05", body: "Received. We are reviewing the case and will respond within the agreed window." },
  { id: "msg_1010a", conversationId: "cnv_c1010", author: "customer", authorLabel: "Peter G.", at: "2026-07-23 10:10", body: "New delivery day arranged with the carrier." },
  { id: "msg_1010b", conversationId: "cnv_c1010", author: "borvat_agent", authorLabel: "Borvat Support", at: "2026-07-23 10:10", body: "Thanks for your message. We are taking this up with the seller and will get back to you as soon as possible." },
  { id: "msg_1010c", conversationId: "cnv_m1010", author: "borvat_agent", authorLabel: "Borvat Support", at: "2026-07-23 10:10", body: "Request on behalf of a customer: New delivery day arranged with the carrier." },
  { id: "msg_1010d", conversationId: "cnv_m1010", author: "merchant", authorLabel: "Vandenberg Home", at: "2026-07-23 10:10", body: "Received. We are reviewing the case and will respond within the agreed window." },
];

export const caseById = (id: string) => demoCases.find((c) => c.id === id);
export const conversationById = (id: string) =>
  demoConversations.find((c) => c.id === id);
export const messagesFor = (conversationId: string) =>
  demoMessages.filter((m) => m.conversationId === conversationId);
export const conversationsByChannel = (channel: DemoChannel) =>
  demoConversations.filter((c) => c.channel === channel);
