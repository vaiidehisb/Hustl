// Event bus (architecture doc: Kafka between services).
//
// Producers always write to the transactional outbox (`outbox_events`) inside
// the same DB transaction as the state change, so an event is never lost or
// emitted for a rolled-back write.
//  - KAFKA_BROKERS set  → a relay publishes outbox rows to Kafka and consumers
//                          use Kafka consumer groups.
//  - KAFKA_BROKERS unset → consumers read the outbox table directly with
//                          per-consumer offsets (same at-least-once semantics).
// Handlers must be idempotent.

import { Kafka, type Consumer, type Producer } from "kafkajs"
import { prisma, type Prisma } from "@hustl/db"
import { createLogger } from "./logger"

export const TOPICS = {
  USER_CREATED: "user.created",
  USER_KYC_VERIFIED: "user.kyc_verified",
  CREATOR_PROFILE_UPDATED: "creator.profile_updated",
  BRAND_PROFILE_UPDATED: "brand.profile_updated",
  CREATOR_METRICS_UPDATED: "creator.metrics_updated",
  CREATOR_SYNC_COMPLETED: "creator.sync_completed",
  BRIEF_PUBLISHED: "brief.published",
  BRIEF_UPDATED: "brief.updated",
  APPLICATION_SUBMITTED: "application.submitted",
  APPLICATION_STATUS_CHANGED: "application.status_changed",
  OFFER_SENT: "offer.sent",
  OFFER_COUNTERED: "offer.countered",
  OFFER_ACCEPTED: "offer.accepted",
  OFFER_DECLINED: "offer.declined",
  CONTRACT_SIGNED: "contract.signed",
  DEAL_FUNDED: "deal.funded",
  DEAL_STATUS_CHANGED: "deal.status_changed",
  MILESTONE_SUBMITTED: "milestone.submitted",
  MILESTONE_APPROVED: "milestone.approved",
  MILESTONE_REVISION_REQUESTED: "milestone.revision_requested",
  DEAL_COMPLETED: "deal.completed",
  PAYMENT_FUNDED: "payment.funded",
  PAYMENT_RELEASED: "milestone.payment_released",
  PAYMENT_REFUNDED: "payment.refunded",
  PAYMENT_DISPUTED: "payment.disputed",
  DISPUTE_OPENED: "dispute.opened",
  DISPUTE_RESOLVED: "dispute.resolved",
  MESSAGE_SENT: "message.sent",
  FRAUD_FLAGGED: "fraud.flagged",
  MEDIA_READY: "media.ready",
} as const
export type Topic = (typeof TOPICS)[keyof typeof TOPICS]

export type EventEnvelope<T = Record<string, unknown>> = { id: string; topic: Topic; key: string; payload: T; createdAt: string }

type Tx = Prisma.TransactionClient | typeof prisma

/** Record an event in the outbox. Pass the transaction client to make it atomic with the write. */
export async function publish<T extends Record<string, unknown>>(tx: Tx, topic: Topic, key: string, payload: T) {
  await tx.outboxEvent.create({ data: { topic, key, payload: payload as Prisma.InputJsonValue } })
}

const kafkaBrokers = () => process.env.KAFKA_BROKERS?.split(",").map((b) => b.trim()).filter(Boolean)

let producer: Producer | undefined

/** Publishes unpublished outbox rows to Kafka. Run inside every producing service when Kafka is configured. */
export function startOutboxRelay(service: string, intervalMs = 500) {
  const brokers = kafkaBrokers()
  if (!brokers?.length) return () => {}
  const log = createLogger(`${service}:outbox-relay`)
  const kafka = new Kafka({ clientId: `${service}-relay`, brokers })
  let stopped = false
  const loop = async () => {
    producer ??= kafka.producer({ idempotent: true })
    await producer.connect()
    while (!stopped) {
      const rows = await prisma.$transaction(async (tx) => {
        // SKIP LOCKED lets several relay instances run safely.
        const batch = await tx.$queryRaw<{ id: bigint; topic: string; key: string; payload: unknown; created_at: Date }[]>`
          SELECT id, topic, key, payload, created_at FROM outbox_events
          WHERE published_at IS NULL ORDER BY id LIMIT 100 FOR UPDATE SKIP LOCKED`
        if (!batch.length) return batch
        for (const r of batch) {
          await producer!.send({
            topic: r.topic,
            messages: [{ key: r.key, value: JSON.stringify({ id: String(r.id), topic: r.topic, key: r.key, payload: r.payload, createdAt: r.created_at.toISOString() }) }],
          })
        }
        await tx.$executeRaw`UPDATE outbox_events SET published_at = now() WHERE id = ANY(${batch.map((b) => b.id)})`
        return batch
      })
      if (!rows.length) await new Promise((r) => setTimeout(r, intervalMs))
    }
  }
  loop().catch((err) => log.error({ err }, "outbox relay crashed"))
  return () => {
    stopped = true
  }
}

type Handler = (event: EventEnvelope) => Promise<void>

/** Subscribe a named consumer to topics. Returns a stop function. */
export function subscribe(consumer: string, topics: Topic[], handler: Handler, intervalMs = 1000) {
  const log = createLogger(`${consumer}:consumer`)
  const brokers = kafkaBrokers()

  if (brokers?.length) {
    const kafka = new Kafka({ clientId: consumer, brokers })
    let c: Consumer | undefined
    ;(async () => {
      c = kafka.consumer({ groupId: consumer })
      await c.connect()
      for (const topic of topics) await c.subscribe({ topic, fromBeginning: false })
      await c.run({
        eachMessage: async ({ message }) => {
          if (!message.value) return
          await handler(JSON.parse(message.value.toString()) as EventEnvelope)
        },
      })
    })().catch((err) => log.error({ err }, "kafka consumer crashed"))
    return async () => {
      await c?.disconnect()
    }
  }

  let stopped = false
  ;(async () => {
    for (const topic of topics)
      await prisma.consumerOffset.upsert({
        where: { consumer_topic: { consumer, topic } },
        update: {},
        // New consumers start from the current head, like Kafka's fromBeginning: false.
        create: { consumer, topic, lastEventId: (await prisma.outboxEvent.aggregate({ _max: { id: true } }))._max.id ?? BigInt(0) },
      })
    while (!stopped) {
      let processed = 0
      for (const topic of topics) {
        const offset = await prisma.consumerOffset.findUniqueOrThrow({ where: { consumer_topic: { consumer, topic } } })
        const events = await prisma.outboxEvent.findMany({ where: { topic, id: { gt: offset.lastEventId } }, orderBy: { id: "asc" }, take: 50 })
        for (const e of events) {
          try {
            await handler({ id: String(e.id), topic: e.topic as Topic, key: e.key, payload: e.payload as Record<string, unknown>, createdAt: e.createdAt.toISOString() })
          } catch (err) {
            log.error({ err, eventId: String(e.id), topic }, "event handler failed; will retry")
            break
          }
          await prisma.consumerOffset.update({ where: { consumer_topic: { consumer, topic } }, data: { lastEventId: e.id } })
          processed++
        }
      }
      if (!processed) await new Promise((r) => setTimeout(r, intervalMs))
    }
  })().catch((err) => log.error({ err }, "outbox consumer crashed"))
  return async () => {
    stopped = true
  }
}
