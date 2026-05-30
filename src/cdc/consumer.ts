/**
 * EpochBridge — CDC Kafka Consumer
 *
 * Consumes CDC events from the Kafka topic and re-publishes them
 * to the in-process GraphQL PubSub engine so active subscriptions
 * receive real-time updates.
 */

import { Kafka, Consumer, EachMessagePayload } from 'kafkajs';
import { config } from '../config';
import { logger } from '../utils/logger';
import type { CDCEvent } from '../types';

export class CDCConsumer {
  private kafka: Kafka;
  private consumer: Consumer;
  private isConnected = false;
  private onEventCallbacks: Array<(event: CDCEvent) => void> = [];

  constructor() {
    this.kafka = new Kafka({
      clientId: `${config.kafka.clientId}-consumer`,
      brokers: config.kafka.brokers,
      retry: { retries: 5 },
    });
    this.consumer = this.kafka.consumer({
      groupId: config.kafka.groupId,
      sessionTimeout: 30000,
      heartbeatInterval: 3000,
    });
  }

  onEvent(cb: (event: CDCEvent) => void): void {
    this.onEventCallbacks.push(cb);
  }

  async connect(): Promise<void> {
    try {
      await this.consumer.connect();
      await this.consumer.subscribe({
        topic: config.kafka.cdcTopic,
        fromBeginning: false,
      });

      await this.consumer.run({
        eachMessage: async (payload: EachMessagePayload) => {
          const { message } = payload;
          if (!message.value) return;

          try {
            const event: CDCEvent = JSON.parse(message.value.toString());
            logger.debug(`[CDC Consumer] Received ${event.operation} on ${event.table}`);
            for (const cb of this.onEventCallbacks) cb(event);
          } catch (err) {
            logger.error('[CDC Consumer] Failed to parse CDC message', err);
          }
        },
      });

      this.isConnected = true;
      logger.info(`[CDC Consumer] Subscribed to topic: ${config.kafka.cdcTopic}`);
    } catch (err) {
      logger.warn('[CDC Consumer] Kafka not available — subscription via local pub/sub only');
      this.isConnected = false;
    }
  }

  async disconnect(): Promise<void> {
    if (this.isConnected) {
      await this.consumer.disconnect();
      logger.info('[CDC Consumer] Disconnected from Kafka');
    }
  }
}
