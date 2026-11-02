// /**
//  * src/models/transaction_source_sms.test.ts
//  *
//  * Edge case verification for TransactionSourceSms translation:
//  * - Empty string vs null vs undefined handling
//  * - Trim behavior on reference vs body
//  * - DateTime parsing & serialization
//  * - Conditional omission of null keys in JSON & DB serialization
//  */

// import {
//   createTransactionSourceSms,
//   transactionSourceSmsFromJson,
//   transactionSourceSmsToJson,
//   transactionSourceSmsToDb,
// } from "./transaction_source_sms";

// describe("TransactionSourceSms (Strict Dart Translation)", () => {
//   const sampleIsoDate = "2026-03-15T10:30:00.000Z";

//   describe("transactionSourceSmsFromJson", () => {
//     it("parses full valid JSON into typed domain model", () => {
//       const parsed = transactionSourceSmsFromJson({
//         transactionReference: " REF-1001 ",
//         body: " You received 500 ETB. ",
//         senderAddress: " CBE ",
//         receivedAt: sampleIsoDate,
//         messageId: " 4291 ",
//       });

//       // Dart trims transactionReference
//       expect(parsed.transactionReference).toBe("REF-1001");
//       // Dart does NOT trim body
//       expect(parsed.body).toBe(" You received 500 ETB. ");
//       // Dart trims and normalizes senderAddress
//       expect(parsed.senderAddress).toBe("CBE");
//       expect(parsed.receivedAt?.toISOString()).toBe(sampleIsoDate);
//       expect(parsed.messageId).toBe("4291");
//     });

//     it("normalizes empty and whitespace-only strings to null for nullable fields", () => {
//       const parsed = transactionSourceSmsFromJson({
//         transactionReference: "REF1",
//         body: "Body",
//         senderAddress: "   ",
//         receivedAt: "",
//         messageId: "",
//       });

//       expect(parsed.senderAddress).toBeNull();
//       expect(parsed.receivedAt).toBeNull();
//       expect(parsed.messageId).toBeNull();
//     });

//     it("handles missing/undefined/null inputs with exact Dart defaults", () => {
//       const parsed = transactionSourceSmsFromJson({});

//       expect(parsed.transactionReference).toBe("");
//       expect(parsed.body).toBe("");
//       expect(parsed.senderAddress).toBeNull();
//       expect(parsed.receivedAt).toBeNull();
//       expect(parsed.messageId).toBeNull();
//     });

//     it("returns null for invalid date strings without throwing", () => {
//       const parsed = transactionSourceSmsFromJson({
//         transactionReference: "REF1",
//         body: "Body",
//         receivedAt: "not-a-valid-iso-date",
//       });

//       expect(parsed.receivedAt).toBeNull();
//     });
//   });

//   describe("transactionSourceSmsToJson & transactionSourceSmsToDb", () => {
//     it("includes all keys when nullable fields are populated", () => {
//       const entity = createTransactionSourceSms({
//         transactionReference: "REF-1",
//         body: "Body text",
//         senderAddress: "CBE",
//         receivedAt: new Date(sampleIsoDate),
//         messageId: "MSG-1",
//       });

//       const json = transactionSourceSmsToJson(entity);

//       expect(json).toEqual({
//         transactionReference: "REF-1",
//         body: "Body text",
//         senderAddress: "CBE",
//         receivedAt: sampleIsoDate,
//         messageId: "MSG-1",
//       });
//       expect(transactionSourceSmsToDb(entity)).toEqual(json);
//     });

//     it("strictly omits null keys (matching Dart collection-if behavior)", () => {
//       const entity = createTransactionSourceSms({
//         transactionReference: "REF-1",
//         body: "Body text",
//         senderAddress: null,
//         receivedAt: null,
//         messageId: null,
//       });

//       const json = transactionSourceSmsToJson(entity);

//       expect(json).toEqual({
//         transactionReference: "REF-1",
//         body: "Body text",
//       });
//       expect("senderAddress" in json).toBe(false);
//       expect("receivedAt" in json).toBe(false);
//       expect("messageId" in json).toBe(false);
//       expect(transactionSourceSmsToDb(entity)).toEqual(json);
//     });
//   });
// });
