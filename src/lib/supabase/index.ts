import { Tables, TablesInsert, TablesUpdate } from "./database.types";

export * from "./client";
export * from "./database.types";

// Domain Row types
export type DbBusiness = Tables<"businesses">;
export type DbBranch = Tables<"branches">;
export type DbBusinessMember = Tables<"business_members">;
export type DbBranchMembership = Tables<"branch_memberships">;
export type DbDevice = Tables<"devices">;
export type DbDeviceAssignment = Tables<"device_assignments">;
export type DbDeviceBankAccount = Tables<"device_bank_accounts">;
export type DbBank = Tables<"banks">;
export type DbAccount = Tables<"accounts">;
export type DbCategory = Tables<"categories">;
export type DbTransaction = Tables<"transactions">;
export type DbFailedParse = Tables<"failed_parses">;

// Insert types
export type DbTransactionInsert = TablesInsert<"transactions">;
export type DbCategoryInsert = TablesInsert<"categories">;
export type DbAccountInsert = TablesInsert<"accounts">;
export type DbDeviceInsert = TablesInsert<"devices">;
export type DbFailedParseInsert = TablesInsert<"failed_parses">;

// Update types
export type DbTransactionUpdate = TablesUpdate<"transactions">;
export type DbCategoryUpdate = TablesUpdate<"categories">;
export type DbAccountUpdate = TablesUpdate<"accounts">;
export type DbDeviceUpdate = TablesUpdate<"devices">;
