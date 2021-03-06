import config from '@app/config'
import { Callback } from '@app/interfaces'
import { logger } from '@app/logger'
import { errors } from '@app/server/core/exceptions'
import {
  AddressTxsPagesPayload,
  BalancePayload,
  BlocksTxsPayload,
  ChartPayload,
  EthCallPayload,
  ExchangeRatePayload,
  JoinLeavePayload,
  TokensBalancePayload,
  TxsPayload
} from '@app/server/core/payloads'
import { Streamer, StreamingEvent } from '@app/server/core/streams'
import { Block, BlocksService } from '@app/server/modules/blocks'
import { ChartService } from '@app/server/modules/charts'
import { ExchangeService } from '@app/server/modules/exchanges'
import { PendingTxService } from '@app/server/modules/pending-tx'
import { Tx, TxsService } from '@app/server/modules/txs'
import { UnclesService } from '@app/server/modules/uncle'
import { VmService } from '@app/server/modules/vm'
import * as fs from 'fs'
import * as http from 'http'
import * as SocketIO from 'socket.io'
import { AddressService } from './modules/address'

export type SocketEventPayload =
  | AddressTxsPagesPayload
  | BalancePayload
  | BlocksTxsPayload
  | Buffer
  | ChartPayload
  | EthCallPayload
  | ExchangeRatePayload
  | JoinLeavePayload
  | TokensBalancePayload
  | TxsPayload
  | any

export type SocketEventResponse = Block | Block[] | Tx | Tx[] | number | any

export interface SocketEventValidationResult {
  readonly valid: boolean
  readonly errors?: any[]
}

export interface SocketEvent {
  id: string
  onValidate: (server: EthVMServer, socket: SocketIO.Socket, payload: any) => SocketEventValidationResult
  onEvent: (server: EthVMServer, socket: SocketIO.Socket, payload?: SocketEventPayload) => Promise<SocketEventResponse>
}

export class EthVMServer {
  public io: SocketIO.Server

  private server
  private readonly events: Map<string, SocketEvent> = new Map()

  constructor(
    public readonly blockService: BlocksService,
    public readonly uncleService: UnclesService,
    public readonly addressService: AddressService,
    public readonly txsService: TxsService,
    public readonly chartsService: ChartService,
    public readonly pendingTxService: PendingTxService,
    public readonly exchangesService: ExchangeService,
    public readonly vmService: VmService,
    private readonly streamer: Streamer
  ) {}

  public async start() {
    logger.debug('EthVMServer - createWSServer() / Creating http server')
    this.server = http.createServer()
    const opts = {
      host: config.get('server.host'),
      port: config.get('server.port')
    }

    logger.debug('EthVMServer - createWSServer() / Starting listening on http server')
    this.server.listen(opts, () => {
      logger.debug(`EthVMServer - createWSServer() / Http server listening on ${opts.host}:${opts.port}`)
    })

    logger.debug('EthVMServer - createWSServer() / Creating SocketIO server')
    this.io = SocketIO(this.server)

    logger.debug('EthVMServer - start() / Loading socket events...')
    const events = fs.readdirSync(`${__dirname}/events/`)
    events.forEach(async ev => {
      if (ev.match(/.*\.spec\.ts/)) {
        // Ignore test files
        return
      }
      logger.debug(`EthVMServer - start() / Registering socket event: ${ev}`)
      const event = await import(`${__dirname}/events/${ev}`)
      this.events.set(event.default.id, event.default)
    })

    logger.debug('EthVMServer - start() / Registering streamer events')
    this.streamer.addListener('block', this.onBlockEvent)
    this.streamer.addListener('tx', this.onTxEvent);
    this.streamer.addListener('pendingTx', this.onPendingTxEvent)
    this.streamer.addListener('account', this.onAccountEvent);
    this.streamer.addListener('uncle', this.onUncleEvent);

    logger.debug('EthVMServer - start() / Starting to listen socket events on SocketIO')
    this.io.on(
      'connection',
      (socket: SocketIO.Socket): void => {
        this.registerSocketEventsOnConnection(socket)
      }
    )
  }

  public async stop() {
    const socketPromise = new Promise(resolve => this.io.close(() => resolve(true)))
    const serverPromise = new Promise(resolve => this.server.close(() => resolve(true)))
    return Promise.all([socketPromise, serverPromise])
  }

  private registerSocketEventsOnConnection(socket: SocketIO.Socket): void {
    this.events.forEach(
      (event: SocketEvent): void => {
        socket.on(
          event.id,
          (payload: any, cb?: Callback): void => {
            const validationResult = event.onValidate(this, socket, payload)
            if (!validationResult.valid) {
              logger.error(`event -> ${event.id} / Invalid payload: ${JSON.stringify(payload)}`)
              if (cb) {
                cb(errors.BAD_REQUEST, null)
              }
              return
            }

            event
              .onEvent(this, socket, payload)
              .then(res => {
                // Some events like join, leave doesn't produce a concrete result, so better to not send anything back
                if (typeof res === 'undefined') {
                  return
                }

                if (cb) {
                  cb(null, res)
                }
              })
              .catch(err => {
                logger.error(`event -> ${event.id} / Error: ${err}`)

                // TODO: Until we have defined which errors are we going to return, we use a generic one
                if (cb) {
                  cb(errors.INTERNAL_SERVER_ERROR, null)
                }
              })
          }
        )
      }
    )
  }

  // TODO: This method should only receive the block and emit it directly
  // This logic should not be here
  private onBlockEvent = (event: StreamingEvent): void => {

    const { op, key, value } = event;

    logger.info(`EthVMServer - onBlockEvent / Op: ${op}, Hash: ${value.hash}, `)

    // Save state root if defined
    // if (block.stateRoot) {
    //   this.vmService.setStateRoot(Buffer.from(block.stateRoot))
    // }

    // // TODO: Remove this calculation from here, should be done while inserting the new block
    // // Calculate previous block time
    // const ts = new BigNumber(utils.toHex(block.timestamp))
    // if (!this.previousBlockTime) {
    // this.previousBlockTime = ts.minus(this.blockTime)
    // }

    // const currentBlockTime = ts.minus(this.previousBlockTime).abs()
    // if (!block.isUncle) {
    // this.previousBlockTime = new BigNumber(utils.toHex(block.timestamp))
    // }

    // // Generate block stats
    // const bstats = mappers.toBlockStats(block.transactions, currentBlockTime)
    // block.blockStats = { ...bstats, ...block.blockStats }

    // const blockHash = bufferToHex(Buffer.from(block.hash))
    // const smallBlock = mappers.toSmallBlock(block)

    // // Send to client
    // this.io.to(blockHash).emit(blockHash + '_update', smallBlock)
    // this.io.to('blocks').emit('newBlock', smallBlock)

    // const txs = block.transactions || []
    // if (txs.length > 0) {
    //   txs.forEach(tx => {
    //     const txHash = tx.hash
    //     this.io.to(txHash).emit(txHash + '_update', tx)
    //   })
    //   this.io.to('txs').emit('newTx', txs)
    //   this.ds.putTransactions(txs)
    // }
  }

  private onTxEvent = (event: StreamingEvent): void => {

    const { op, key, value } = event;

    logger.info(`EthVMServer - onTxEvent / Op: ${op}, Hash: ${key}`);
    // const txHash = tx.hash
    // this.io.to(txHash).emit(`${txHash}_update`, tx)
    // this.io.to('pendingTxs').emit('newPendingTx', tx)
  }

  private onPendingTxEvent = (event: StreamingEvent): void => {

    const { op, key, value } = event;

    logger.info(`EthVMServer - onPendingTxEvent / Op: ${op}, Hash: ${key}`);
    // const txHash = tx.hash
    // this.io.to(txHash).emit(`${txHash}_update`, tx)
    // this.io.to('pendingTxs').emit('newPendingTx', tx)
  }

  private onUncleEvent = (event: StreamingEvent): void => {

    const { op, key, value } = event;

    logger.info(`EthVMServer - onUncleEvent / Op: ${op}, Hash: ${key}`);

  }

  private onAccountEvent = (event: StreamingEvent): void => {

    const { op, key, value } = event;

    logger.info(`EthVMServer - onAccountEvent / Op: ${op}, Address: ${key}`);

  }
}
