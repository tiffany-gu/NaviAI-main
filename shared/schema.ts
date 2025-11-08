import { sql } from "drizzle-orm";
import { pgTable, text, varchar, real, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const tripRequests = pgTable("trip_requests", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  origin: text("origin").notNull(),
  destination: text("destination").notNull(),
  fuelLevel: real("fuel_level"),
  vehicleRange: real("vehicle_range"),
  preferences: jsonb("preferences").$type<{
    scenic?: boolean;
    fast?: boolean;
    avoidTolls?: boolean;
    restaurantPreferences?: {
      cuisine?: string;
      rating?: number;
      priceLevel?: string;
      kidFriendly?: boolean;
      openNow?: boolean;
      vegetarian?: boolean;
      vegan?: boolean;
    };
    requestedStops?: {
      gas?: boolean;
      restaurant?: boolean;
      scenic?: boolean;
    };
  }>(),
  route: jsonb("route").$type<any>(),
  stops: jsonb("stops").$type<any[]>(),
});

export const insertTripRequestSchema = createInsertSchema(tripRequests).omit({
  id: true,
});

export type InsertTripRequest = z.infer<typeof insertTripRequestSchema>;
export type TripRequest = typeof tripRequests.$inferSelect;

export const conversationMessages = pgTable("conversation_messages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tripRequestId: varchar("trip_request_id").references(() => tripRequests.id),
  role: text("role").notNull(),
  content: text("content").notNull(),
  timestamp: text("timestamp").notNull(),
});

export const insertConversationMessageSchema = createInsertSchema(conversationMessages).omit({
  id: true,
});

export type InsertConversationMessage = z.infer<typeof insertConversationMessageSchema>;
export type ConversationMessage = typeof conversationMessages.$inferSelect;
