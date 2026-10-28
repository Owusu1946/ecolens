import { pgTableCreator } from "drizzle-orm/pg-core";

// Tables map camelCase properties to snake_case columns.
export const pgTable = pgTableCreator((name) => name, "snake_case");
