import config from '@app/config'
import { logger } from '@app/logger'
import { NullStreamer } from '@app/server/core/streams'
import { EthVMServer } from '@app/server/ethvm-server'
import { AddressServiceImpl, MongoAddressRepository } from '@app/server/modules/address'
import { BlocksServiceImpl, MongoBlockRepository } from '@app/server/modules/blocks'
import { ChartsServiceImpl, MockChartsRepository } from '@app/server/modules/charts'
import { MongoUncleRepository, UnclesServiceImpl } from '@app/server/modules/uncle'

import { CoinMarketCapRepository, ExchangeServiceImpl } from '@app/server/modules/exchanges'
import { MongoPendingTxRepository, PendingTxServiceImpl } from '@app/server/modules/pending-tx'
import { MongoTxsRepository, TxsServiceImpl } from '@app/server/modules/txs'
import { RedisTrieDb, VmEngine, VmRunner, VmServiceImpl } from '@app/server/modules/vm'
import { RedisCacheRepository } from '@app/server/repositories'
import * as EventEmitter from 'eventemitter3'
import * as Redis from 'ioredis'
import { MongoClient } from 'mongodb'
import { MongoStreamer } from '@app/server/core/streams/mongo.streamer'

async function bootstrapServer() {
  logger.debug('bootstrapper -> Bootstraping ethvm-socket-server!')

  // Create TrieDB
  logger.debug('bootstrapper -> Initializing TrieDB')
  const trieOpts = {
    host: config.get('eth.trie_db.redis.host'),
    port: config.get('eth.trie_db.redis.port'),
    db: config.get('eth.trie_db.redis.db'),
    rpcHost: config.get('eth.rpc.host'),
    rpcPort: config.get('eth.rpc.port')
  }
  const trieDb = new RedisTrieDb(trieOpts)

  // Create VmEngine
  logger.debug('bootstrapper -> Initializing VmEngine')
  const vmeOpts = {
    rpcUrl: config.get('eth.vm.engine.rpc_url'),
    tokensAddress: config.get('eth.vm.engine.tokens_smart_contract'),
    account: config.get('eth.vm.engine.account')
  }
  const vme = new VmEngine(vmeOpts)

  // Create VmRunner
  logger.debug('bootstrapper -> Initializing VmRunner')
  const gasLimit = config.get('eth.vm.engine.gas_limit')
  const vmr = new VmRunner(trieDb, gasLimit)

  // Create Cache data store
  logger.info('bootstrapper -> Initializing redis cache data store')
  const redis = new Redis({
    host: config.get('data_stores.redis.host'),
    port: config.get('data_stores.redis.port')
  })
  const socketRows = config.get('data_stores.redis.socket_rows')
  const ds = new RedisCacheRepository(redis, socketRows)
  await ds.initialize().catch(() => process.exit(-1))

  // Set default state block to VmRunner
  const blocks = await ds.getBlocks()
  const configStateRoot = config.get('eth.state_root')
  const hasStateRoot = blocks && blocks[0] && blocks[0].header.stateRoot
  const stateRoot = hasStateRoot ? Buffer.from(blocks[0].header.stateRoot!!) : Buffer.from(configStateRoot, 'hex')
  vmr.setStateRoot(stateRoot)

  // Create block event emmiter
  logger.debug('bootstrapper -> Initializing event emitter')
  const emitter = new EventEmitter()

  // Create Blockchain data store
  logger.debug('bootstrapper -> Connecting MongoDB')
  const mongoUrl = config.get('data_stores.mongo_db.url')
  const client = await MongoClient.connect(mongoUrl).catch(() => process.exit(-1))

  logger.debug('bootstrapper -> Selecting MongoDB database')
  const dbName = config.get('data_stores.mongo_db.db')
  const db = client.db(dbName)

  // Create services
  // ---------------

  // Blocks
  const blocksRepository = new MongoBlockRepository(db)
  const blockService = new BlocksServiceImpl(blocksRepository, ds)

  // Uncles
  const unclesRepository = new MongoUncleRepository(db)
  const uncleService = new UnclesServiceImpl(unclesRepository, ds)

  // Adress
  const addressRepository = new MongoAddressRepository(db)
  const addressService = new AddressServiceImpl(addressRepository, ds)

  // Adress
  const pendingTxRepository = new MongoPendingTxRepository(db)
  const pendingTxService = new PendingTxServiceImpl(pendingTxRepository, ds)

  // Txs
  const txsRepository = new MongoTxsRepository(db)
  const txsService = new TxsServiceImpl(txsRepository, ds)

  // Charts
  const chartsRepository = new MockChartsRepository()
  const chartsService = new ChartsServiceImpl(chartsRepository)

  // Exchanges
  const exchangeRepository = new CoinMarketCapRepository(ds)
  const exchangeService = new ExchangeServiceImpl(exchangeRepository, ds)

  // Vm
  const vmService = new VmServiceImpl(vme, vmr)

  // Create streamer
  // ---------------
  logger.debug('bootstrapper -> Initializing streamer')
  const streamer = new MongoStreamer(db, emitter)
  await streamer.initialize()

  // Create server
  logger.debug('bootstrapper -> Initializing server')
  const server = new EthVMServer(blockService, uncleService, addressService, txsService, chartsService, pendingTxService, exchangeService, vmService, streamer)
  await server.start()
}

bootstrapServer()
