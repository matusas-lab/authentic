// modules/sms-reader/src/SmsReader.types.ts

/**
 * Standard Android Telephony SMS content provider column names,
 * matching Dart telephony's SmsColumn definitions.
 */
export const SmsColumn = {
  ID: "_id",
  ADDRESS: "address",
  SERVICE_CENTER_ADDRESS: "service_center",
  BODY: "body",
  DATE: "date",
  DATE_SENT: "date_sent",
  READ: "read",
  SEEN: "seen",
  STATUS: "status",
  SUBJECT: "subject",
  SUBSCRIPTION_ID: "sub_id",
  THREAD_ID: "thread_id",
  TYPE: "type",
} as const;

export type SmsColumnType = (typeof SmsColumn)[keyof typeof SmsColumn];

export const DEFAULT_SMS_COLUMNS: SmsColumnType[] = [
  SmsColumn.ID,
  SmsColumn.ADDRESS,
  SmsColumn.BODY,
  SmsColumn.DATE,
];

export enum Sort {
  ASC = "ASC",
  DESC = "DESC",
}

export class OrderBy {
  constructor(
    public readonly column: SmsColumnType | string,
    public readonly sort: Sort = Sort.DESC
  ) {}

  get value(): string {
    return `${this.column} ${this.sort}`;
  }
}

/**
 * Fluent builder for SMS queries, mirroring Dart telephony's SmsFilter.
 *
 * Example:
 * ```ts
 * SmsFilter.where(SmsColumn.DATE).greaterThanOrEqualTo(lowerBound)
 *   .and(SmsColumn.DATE).lessThanOrEqualTo(upperBound)
 * ```
 */
export class SmsFilter {
  constructor(
    public readonly selection: string,
    public readonly selectionArgs: string[]
  ) {}

  static where(column: SmsColumnType | string): SmsFilterStatement {
    return new SmsFilterStatement(column);
  }

  and(column: SmsColumnType | string): SmsFilterStatement {
    return new SmsFilterStatement(
      column,
      `${this.selection} AND`,
      [...this.selectionArgs]
    );
  }

  or(column: SmsColumnType | string): SmsFilterStatement {
    return new SmsFilterStatement(
      column,
      `${this.selection} OR`,
      [...this.selectionArgs]
    );
  }
}

export class SmsFilterStatement {
  constructor(
    private readonly column: string,
    private readonly previousFilter: string = "",
    private readonly previousFilterArgs: string[] = []
  ) {}

  private createFilter(value: string | number, operator: string): SmsFilter {
    const clause = this.previousFilter
      ? `${this.previousFilter} ${this.column} ${operator} ?`
      : `${this.column} ${operator} ?`;
    return new SmsFilter(clause, [...this.previousFilterArgs, String(value)]);
  }

  equals(value: string | number): SmsFilter {
    return this.createFilter(value, "=");
  }

  greaterThan(value: string | number): SmsFilter {
    return this.createFilter(value, ">");
  }

  lessThan(value: string | number): SmsFilter {
    return this.createFilter(value, "<");
  }

  greaterThanOrEqualTo(value: string | number): SmsFilter {
    return this.createFilter(value, ">=");
  }

  lessThanOrEqualTo(value: string | number): SmsFilter {
    return this.createFilter(value, "<=");
  }

  notEqualTo(value: string | number): SmsFilter {
    return this.createFilter(value, "!=");
  }

  like(value: string): SmsFilter {
    return this.createFilter(value, "LIKE");
  }

  inValues(values: (string | number)[]): SmsFilter {
    const placeholders = values.map(() => "?").join(",");
    const clause = this.previousFilter
      ? `${this.previousFilter} ${this.column} IN (${placeholders})`
      : `${this.column} IN (${placeholders})`;
    return new SmsFilter(clause, [
      ...this.previousFilterArgs,
      ...values.map(String),
    ]);
  }

  between(from: string | number, to: string | number): SmsFilter {
    const clause = this.previousFilter
      ? `${this.previousFilter} ${this.column} BETWEEN ? AND ?`
      : `${this.column} BETWEEN ? AND ?`;
    return new SmsFilter(clause, [
      ...this.previousFilterArgs,
      String(from),
      String(to),
    ]);
  }
}

/**
 * Parsed SMS message representation returned by getInboxSms().
 */
export interface SmsMessage {
  id?: string | number | null;
  _id?: string | number | null;
  address?: string | null;
  originatingAddress?: string | null;
  body?: string | null;
  date?: number | null;
  timestamp?: number | null;
  dateSent?: number | null;
  sentAt?: number | null;
  read?: boolean | null;
  seen?: boolean | null;
  status?: number | null;
  subject?: string | null;
  subscriptionId?: number | null;
  sub_id?: number | null;
  threadId?: string | number | null;
  type?: number | null;
  serviceCenterAddress?: string | null;
  [key: string]: any;
}

/**
 * Options for querying the SMS inbox, identical to Dart telephony's getInboxSms parameter list.
 */
export interface GetInboxSmsOptions {
  /**
   * Columns to retrieve. Defaults to [ID, ADDRESS, BODY, DATE].
   */
  columns?: (SmsColumnType | string)[];

  /**
   * Filter condition (WHERE clause) built with SmsFilter or as raw SQL object.
   */
  filter?: SmsFilter | { selection: string; selectionArgs: (string | number)[] };

  /**
   * Sorting order, e.g. [new OrderBy(SmsColumn.DATE, Sort.DESC)].
   */
  sortOrder?: (OrderBy | string)[] | string;

  /**
   * Maximum number of messages to return.
   */
  limit?: number;

  /**
   * Target SMS content box. Defaults to "inbox".
   */
  box?: "inbox" | "sent" | "draft" | "all";
}

// Legacy aliases for backward compatibility with existing codebase
export type HistoricalSmsMessage = SmsMessage;
export type InboxSmsMessages = SmsMessage;
