import { PubSub } from "graphql-subscriptions";
import { logger } from "../utils/logger";
import type { CDCEvent } from "../types";

export const CDC_TOPIC = "CDC_EVENT";
export const pubsub = new PubSub();

export function publishCDCEvent(event: CDCEvent): void {
  pubsub.publish(CDC_TOPIC, { cdcEvent: event });
  logger.debug("[PubSub] Published " + event.operation + " on " + event.table);
}
