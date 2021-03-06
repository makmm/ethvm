import { Streamer, StreamingEvent, StreamingEventName } from '@app/server/core/streams/streamer'
import { ChangeStream, Collection, Cursor, Db } from 'mongodb'
import EventEmitter from 'eventemitter3'
import { MongoEthVM } from '@app/server/repositories'
import { logger } from '@app/logger'

export class MongoStreamer implements Streamer {

  private blocksReader: MongoCollectionChangeStreamReader
  private txReader: MongoCollectionChangeStreamReader
  private pendingTxReader: MongoCollectionChangeStreamReader
  private unclesReader: MongoCollectionChangeStreamReader
  private accountsReader: MongoCollectionChangeStreamReader

  constructor(private readonly db: Db, private readonly emitter: EventEmitter) {
  }

  async initialize(): Promise<boolean> {

    const { db, emitter } = this

    const intervalMs = 1000

    this.blocksReader = new MongoCollectionChangeStreamReader(
      db.collection(MongoEthVM.collections.blocks),
      intervalMs, 'block', emitter
    )

    this.txReader = new MongoCollectionChangeStreamReader(
      db.collection(MongoEthVM.collections.transactions),
      intervalMs, 'tx', emitter
    )

    this.pendingTxReader = new MongoCollectionChangeStreamReader(
      db.collection(MongoEthVM.collections.pendingTxs),
      intervalMs, 'pendingTx', emitter
    )

    this.unclesReader = new MongoCollectionChangeStreamReader(
      db.collection(MongoEthVM.collections.uncles),
      intervalMs, 'uncle', emitter
    )

    this.accountsReader = new MongoCollectionChangeStreamReader(
      db.collection(MongoEthVM.collections.accounts),
      intervalMs, 'account', emitter
    )

    await this.blocksReader.start()
    await this.txReader.start()
    await this.pendingTxReader.start()

    return true
  }

  addListener(eventName: string, fn: EventEmitter.ListenerFn) {
    this.emitter.addListener(eventName, fn)
  }

  removeListener(eventName: string, fn?: EventEmitter.ListenerFn) {
    this.emitter.removeListener(eventName, fn)
  }

}

class MongoCollectionChangeStreamReader {

  private changeStream: ChangeStream
  private cursor: Cursor<any>

  constructor(private readonly collection: Collection,
              private readonly intervalMs: number,
              private readonly eventType: StreamingEventName,
              private readonly emitter: EventEmitter) {
  }

  start() {
    const changeStream = this.changeStream = this.collection
      .watch([], {
        fullDocument: 'updateLookup'
      })

    this.cursor = changeStream.stream()

    this.pull()
  }

  async pull() {

    const { cursor, eventType, emitter } = this

    try{

      console.log('Attempting to pull', eventType)

      while (!cursor.isClosed()) {

        const next = await cursor.next()

        if (next != null) {

          const { operationType, fullDocument, documentKey } = next
          const event: StreamingEvent = {
            op: operationType,
            key: documentKey._id,
            value: fullDocument
          }

          emitter.emit(eventType, event)

        } else {
          logger.warn('Empty mongo event')
        }

      }

    } catch (e) {
      logger.error('Failed to pull', eventType, e)
    }

  }

  async stop() {
    await this.changeStream.close()
  }

}
