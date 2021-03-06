import config from '@app/config'
import { errors } from '@app/server/core/exceptions'
import { KafkaStreamer, Streamer } from '@app/server/core/streams'
import { EthVMServer } from '@app/server/ethvm-server'
import { BlocksServiceImpl, MongoBlockRepository } from '@app/server/modules/blocks'
import { MockChartsRepository } from '@app/server/modules/charts'
import { ExchangeRate, ExchangeService, ExchangeServiceImpl, Quote } from '@app/server/modules/exchanges'
import {  MongoTxsRepository, TxsService,TxsServiceImpl } from '@app/server/modules/txs'
import { VmService } from '@app/server/modules/vm'
import { RedisCacheRepository } from '@app/server/repositories'
import { expect } from 'chai'
import * as Redis from 'ioredis'
import { MongoClient } from 'mongodb'
import * as io from 'socket.io-client'
import { mock } from 'ts-mockito'
import { ChartsServiceImpl, MockExchangeRepository, VmServiceImpl } from './mocks'

jest.setTimeout(50000)

const redisClient = new Redis({
  host: config.get('data_stores.redis.host'),
  port: config.get('data_stores.redis.port')
})
const ds = new RedisCacheRepository(redisClient, 10)

function callEvent(ev, payload, client): Promise<any> {
  return new Promise((resolve, reject) => {
    client.emit(ev, payload, (err, d) => {
      if (err) {
        reject(err)
        return
      }
      resolve(d)
    })
  })
}

describe('ethvm-server-events', () => {
  let server: EthVMServer
  let client: any

  beforeAll(async () => {

    const mClient = await MongoClient.connect("mongodb://localhost:27017").catch(() => process.exit(-1))
    const db = mClient.db('ethvm_local')

    const blocksRepository = new MongoBlockRepository(db)
    const blockService = new BlocksServiceImpl(blocksRepository, ds)

    const txsRepository = new MongoTxsRepository(db)
    const txsService: TxsService = new TxsServiceImpl(txsRepository, ds)

    const chartsService = new ChartsServiceImpl(mock(MockChartsRepository))
    const exRepository = new MockExchangeRepository(ds)

    const exchangeService: ExchangeService = new ExchangeServiceImpl(exRepository, ds)
    const vmService: VmService = new VmServiceImpl()

    const streamer: Streamer = mock(KafkaStreamer)

    client = io.connect(`http://${config.get('server.host')}:${config.get('server.port')}`)

    // Create server
    server = new EthVMServer(blockService, txsService, chartsService, exchangeService, vmService, streamer, ds)
    await server.start()
  })

  afterAll(async () => {
    await server.stop()
    client.stop()
  })

  describe('getTxsEvent', () => {
    it('should return Promise<Tx[]>', async () => {
      const inputs = [
        {
          address: '54daeb3e8a6bbc797e4ad2b0339f134b186e4637',
          limit: 10,
          page: 0
        }
      ]
      for (const input of inputs) {
        const data = await callEvent('getTxs', input, client)
        expect(data).to.have.lengthOf(10)
      }
    })

    it('should return err ', async () => {
      const inputs = [
        '',
        '0x',
        '0x0',
        10,
        {},
        {
          address: '0xb903239f8543d04b5dc1ba6579132b143087c68db1b2168786408fcbce568238'
        },
        {
          address: '0xd9ea042ad059033ba3c3be79f4081244f183bf03',
          limit: '1',
          page: 1
        },
        {
          number: 1
        }
      ]

      for (const input of inputs) {
        try {
          const data = await callEvent('getTxs', input, client)
        } catch (e) {
          expect(e).to.be.eql(errors.BAD_REQUEST)
          expect(e).to.not.be.equal(errors.INTERNAL_SERVER_ERROR)
        }
      }
    })
  })

  describe('getBalance', () => {
    it.skip('should return Promise<string>', async () => {
      const inputs = [
        {
          address: '0xd9ea042ad059033ba3c3be79f4081244f183bf03'
        }
      ]

      for (const input of inputs) {
        const data = await callEvent('getBalance', input, client)
        expect(data).to.equal(10)
      }
    })

    it('should return err ', async () => {
      const inputs = [
        '',
        '0x',
        '0x0',
        10,
        {},
        {
          address: '0xb903239f8543d04b5dc1ba6579132b143087c68db1b2168786408fcbce568238'
        },
        {
          address: '0xd9ea042ad059033ba3c3be79f4081244f183bf03',
          limit: '1',
          page: 1
        },
        {
          number: 1
        }
      ]

      for (const input of inputs) {
        try {
          const data = await callEvent('getBalance', input, client)
        } catch (e) {
          expect(e).to.be.eql(errors.BAD_REQUEST)
          expect(e).to.not.be.equal(errors.INTERNAL_SERVER_ERROR)
        }
      }
    })
  })

  describe('getBlockTransactions', () => {
    it.skip('should return Promise<Tx[]>', async () => {
      const inputs = [
        {
          hash: '0xb903239f8543d04b5dc1ba6579132b143087c68db1b2168786408fcbce568238',
          limit: 1,
          page: 1
        }
      ]
      for (const input of inputs) {
        const data = await callEvent('getBlockTransactions', input, client)
        expect(data).to.have.lengthOf(10)
      }
    })
    it('should return err ', async () => {
      const inputs = [
        '',
        '0x',
        '0x0',
        10,
        {},
        {
          address: '0xb903239f8543d04b5dc1ba6579132b143087c68db1b2168786408fcbce568238'
        },
        {
          address: '0xd9ea042ad059033ba3c3be79f4081244f183bf03',
          limit: '1',
          page: 1
        },
        {
          number: 1
        }
      ]
      for (const input of inputs) {
        try {
          const data = await callEvent('getBlockTransactions', input, client)
        } catch (e) {
          expect(e).to.be.eql(errors.BAD_REQUEST)
          expect(e).to.not.be.equal(errors.INTERNAL_SERVER_ERROR)
        }
      }
    })
  })

  describe('getTx Event', () => {
    it('should return Promise<Tx>', async () => {
      const inputs = [
        {
          hash: '19f1df2c7ee6b464720ad28e903aeda1a5ad8780afc22f0b960827bd4fcf656d'
        }
      ]
      for (const input of inputs) {
        const data = await callEvent('getTx', input, client)
        expect(data).to.not.be.empty
      }
    })

    it('should return err ', async () => {
      const inputs = [
        '',
        '0x',
        '0x0',
        10,
        {},
        {
          address: '0xb903239f8543d04b5dc1ba6579132b143087c68db1b2168786408fcbce568238'
        },
        {
          address: '0xd9ea042ad059033ba3c3be79f4081244f183bf03',
          limit: '1',
          page: 1
        },
        {
          number: 1
        }
      ]

      for (const input of inputs) {
        try {
          const data = await callEvent('getTx', input, client)
        } catch (e) {
          expect(e).to.be.eql(errors.BAD_REQUEST)
          expect(e).to.not.be.equal(errors.INTERNAL_SERVER_ERROR)
        }
      }
    })
  })

  describe('getTotalTxs Event', () => {
    it('should return Promise<number>', async () => {
      const inputs = [
        {
          address: 'bd08e0cddec097db7901ea819a3d1fd9de8951a2'
        }
      ]

      for (const input of inputs) {
        const data = await callEvent('getTotalTxs', input, client)
        expect(data).to.equal(1)
      }
    })

    it('should return err ', async () => {
      const inputs = [
        '',
        '0x',
        '0x0',
        10,
        {},
        {
          address: '0xb903239f8543d04b5dc1ba6579132b143087c68db1b2168786408fcbce568238'
        },
        {
          address: '0xd9ea042ad059033ba3c3be79f4081244f183bf03',
          limit: '1',
          page: 1
        },
        {
          number: 1
        }
      ]

      for (const input of inputs) {
        try {
          const data = await callEvent('getTotalTxs', input, client)
        } catch (e) {
          expect(e).to.be.eql(errors.BAD_REQUEST)
          expect(e).to.not.be.equal(errors.INTERNAL_SERVER_ERROR)
        }
      }
    })
  })

  describe('pastTxs', () => {
    it('should return Promise<Tx[]>', async () => {
      const inputs = [
        {
          limit: 10,
          page: 8
        }
      ]

      for (const input of inputs) {
        const data = await callEvent('pastTxs', input, client)
        // timeout happens here
        expect(data).to.have.lengthOf(10)
      }
    })

    it('should return err ', async () => {
      const inputs = [
        '',
        '0x',
        '0x0',
        {
          address: '0xb903239f8543d04b5dc1ba6579132b143087c68db1b2168786408fcbce568238'
        },
        {
          address: '0xd9ea042ad059033ba3c3be79f4081244f183bf03',
          limit: '1',
          page: 1
        },
        {
          number: 1
        }
      ]

      for (const input of inputs) {
        try {
          const data = await callEvent('pastTxs', input, client)
        } catch (e) {
          expect(e).to.be.eql(errors.BAD_REQUEST)
          expect(e).to.not.be.equal(errors.INTERNAL_SERVER_ERROR)
        }
      }
    })
  })

  describe('pastBlocks', () => {
    it('should return Promise<Block[]>', async () => {
      const inputs = [
        {
          limit: 10,
          page: 0
        }
      ]

      for (const input of inputs) {
        const data = await callEvent('pastBlocks', input, client)
        expect(data).to.have.lengthOf(2)
      }
    })

    it('should return err ', async () => {
      const inputs = [
        '',
        '0x',
        '0x0',
        {
          address: '0xb903239f8543d04b5dc1ba6579132b143087c68db1b2168786408fcbce568238'
        },
        {
          address: '0xd9ea042ad059033ba3c3be79f4081244f183bf03',
          limit: '1',
          page: 1
        },
        {
          number: 1
        }
      ]

      for (const input of inputs) {
        try {
          const data = await callEvent('pastBlocks', input, client)
        } catch (e) {
          expect(e).to.be.eql(errors.BAD_REQUEST)
          expect(e).to.not.be.equal(errors.INTERNAL_SERVER_ERROR)
        }
      }
    })
  })

  describe('getBlock', () => {
    it('should return Promise<Block>', async () => {
      const inputs = [
        {
          hash: '2ce94342df186bab4165c268c43ab982d360c9474f429fec5565adfc5d1f258b'
        }
      ]
      for (const input of inputs) {
        const data = await callEvent('getBlock', input, client)
        expect(data).to.be.not.empty
      }
    })
    it('should return err ', async () => {
      const inputs = [
        '',
        '0x',
        '0x0',
        10,
        {},
        {
          address: '0xb903239f8543d04b5dc1ba6579132b143087c68db1b2168786408fcbce568238'
        },
        {
          address: '0xd9ea042ad059033ba3c3be79f4081244f183bf03',
          limit: '1',
          page: 1
        },
        {
          number: 1
        }
      ]
      for (const input of inputs) {
        try {
          const data = await callEvent('getBlock', input, client)
        } catch (e) {
          expect(e).to.be.eql(errors.BAD_REQUEST)
          expect(e).to.not.be.equal(errors.INTERNAL_SERVER_ERROR)
        }
      }
    })
  })

  describe('getChartAccountsGrowth', () => {
    it('should return Promise<any>', async () => {
      const inputs = [
        {
          duration: 'ALL'
        },
        {
          duration: 'YEAR'
        },
        {
          duration: 'MONTH'
        },
        {
          duration: 'DAY'
        }
      ]
      for (const input of inputs) {
        const data = await callEvent('getChartAccountsGrowth', input, client)

        expect(data).to.be.not.undefined
      }
    })
    it('should return err ', async () => {
      const inputs = [
        '',
        '0x',
        '0x0',
        10,
        {},
        {
          address: '0xb903239f8543d04b5dc1ba6579132b143087c68db1b2168786408fcbce568238'
        },
        {
          address: '0xDECAF9CD2367cdbb726E904cD6397eDFcAe6068D',
          number: '1'
        },
        {
          address: '0xDECAF9CD2367cdbb726E904cD6397eDFcAe6068D',
          number: 1
        },
        {
          duration: ''
        },
        {
          duration: 'all'
        },
        {
          duration: []
        },
        {
          duration: ['ALL', 'YEAR']
        }
      ]
      for (const input of inputs) {
        try {
          const data = await callEvent('getChartAccountsGrowth', input, client)
        } catch (e) {
          expect(e).to.be.eql(errors.BAD_REQUEST)
          expect(e).to.not.be.equal(errors.INTERNAL_SERVER_ERROR)
        }
      }
    })
  })

  describe('getChartBlockSize', () => {
    it('should return Promise<number>', async () => {
      const inputs = [
        {
          duration: 'ALL'
        },
        {
          duration: 'YEAR'
        },
        {
          duration: 'MONTH'
        },
        {
          duration: 'DAY'
        }
      ]
      for (const input of inputs) {
        const data = await callEvent('getChartBlockSize', input, client)
        expect(data).to.be.not.undefined
      }
    })
    it('should return err ', async () => {
      const inputs = [
        '',
        '0x',
        '0x0',
        10,
        {},
        {
          address: '0xb903239f8543d04b5dc1ba6579132b143087c68db1b2168786408fcbce568238'
        },
        {
          address: '0xDECAF9CD2367cdbb726E904cD6397eDFcAe6068D',
          number: '1'
        },
        {
          address: '0xDECAF9CD2367cdbb726E904cD6397eDFcAe6068D',
          number: 1
        },
        {
          duration: ''
        },
        {
          duration: 'all'
        },
        {
          duration: []
        },
        {
          duration: ['ALL', 'YEAR']
        }
      ]
      for (const input of inputs) {
        try {
          const data = await callEvent('getChartBlockSize', input, client)
        } catch (e) {
          expect(e).to.be.eql(errors.BAD_REQUEST)
          expect(e).to.not.be.equal(errors.INTERNAL_SERVER_ERROR)
        }
      }
    })
  })

  describe('getChartGasLimit', () => {
    it('should return Promise<number>', async () => {
      const inputs = [
        {
          duration: 'ALL'
        },
        {
          duration: 'YEAR'
        },
        {
          duration: 'MONTH'
        },
        {
          duration: 'DAY'
        }
      ]
      for (const input of inputs) {
        const data = await callEvent('getChartGasLimit', input, client)
        expect(data).to.be.not.undefined
      }
    })
    it('should return err ', async () => {
      const inputs = [
        '',
        '0x',
        '0x0',
        10,
        {},
        {
          address: '0xb903239f8543d04b5dc1ba6579132b143087c68db1b2168786408fcbce568238'
        },
        {
          address: '0xDECAF9CD2367cdbb726E904cD6397eDFcAe6068D',
          number: '1'
        },
        {
          address: '0xDECAF9CD2367cdbb726E904cD6397eDFcAe6068D',
          number: 1
        },
        {
          duration: ''
        },
        {
          duration: 'all'
        },
        {
          duration: []
        },
        {
          duration: ['ALL', 'YEAR']
        }
      ]
      for (const input of inputs) {
        try {
          const data = await callEvent('getChartGasLimit', input, client)
        } catch (e) {
          expect(e).to.be.eql(errors.BAD_REQUEST)
          expect(e).to.not.be.equal(errors.INTERNAL_SERVER_ERROR)
        }
      }
    })
  })

  describe('getChartAvTxFee', () => {
    it('should return Promise<number>', async () => {
      const inputs = [
        {
          duration: 'ALL'
        },
        {
          duration: 'YEAR'
        },
        {
          duration: 'MONTH'
        },
        {
          duration: 'DAY'
        }
      ]
      for (const input of inputs) {
        const data = await callEvent('getChartGasLimit', input, client)
        expect(data).to.be.not.undefined
      }
    })
    it('should return err ', async () => {
      const inputs = [
        '',
        '0x',
        '0x0',
        10,
        {},
        {
          address: '0xb903239f8543d04b5dc1ba6579132b143087c68db1b2168786408fcbce568238'
        },
        {
          address: '0xDECAF9CD2367cdbb726E904cD6397eDFcAe6068D',
          number: '1'
        },
        {
          address: '0xDECAF9CD2367cdbb726E904cD6397eDFcAe6068D',
          number: 1
        },
        {
          duration: ''
        },
        {
          duration: 'all'
        },
        {
          duration: []
        },
        {
          duration: ['ALL', 'YEAR']
        }
      ]
      for (const input of inputs) {
        try {
          const data = await callEvent('getChartAvTxFee', input, client)
        } catch (e) {
          expect(e).to.be.eql(errors.BAD_REQUEST)
          expect(e).to.not.be.equal(errors.INTERNAL_SERVER_ERROR)
        }
      }
    })
  })

  describe('getTokenBalance', () => {
    it.skip('should return Promise<any>', async () => {
      const inputs = [
        {
          address: '0xd9ea042ad059033ba3c3be79f4081244f183bf03'
        }
      ]

      for (const input of inputs) {
        const data = await callEvent('getTokenBalance', input, client)
        expect(data).to.not.be.undefined
      }
    })

    it('should return err ', async () => {
      const inputs = [
        '',
        '0x',
        '0x0',
        10,
        {},
        {
          address: '0xb903239f8543d04b5dc1ba6579132b143087c68db1b2168786408fcbce568238'
        },
        {
          address: '0xd9ea042ad059033ba3c3be79f4081244f183bf03',
          limit: '1',
          page: 1
        },
        {
          number: 1
        }
      ]

      for (const input of inputs) {
        try {
          const data = await callEvent('getTokenBalance', input, client)
        } catch (e) {
          expect(e).to.be.eql(errors.BAD_REQUEST)
          expect(e).to.not.be.equal(errors.INTERNAL_SERVER_ERROR)
        }
      }
    })
  })

  describe('getTicker', () => {
    it('should return Promise<Quote> of USD', async () => {
      const input = {
        symbol: 'ETH',
        to: 'USD'
      }
      // Fill Redis Cache with ExchangeRate
      const quote: Quote = { to: 'USD', price: '20' }
      const er: ExchangeRate = { symbol: 'ETH', quotes: [quote], total_supply: 1000 }
      await ds.putRate(er)
      const data = await callEvent('getTicker', input, client)
      expect(data).to.be.deep.equals({ to: 'USD', price: '20' })
    })

    it('should return Promise<Quote>  of EUR', async () => {
      const input = {
        symbol: 'ETH',
        to: 'USD'
      }
      // Fill Redis Cache with ExchangeRate
      const quote: Quote = { to: 'USD', price: '22' }
      const quote2: Quote = { to: 'EUR', price: '23' }
      const er: ExchangeRate = { symbol: 'ETH', quotes: [quote, quote2], total_supply: 1000 }
      await ds.putRate(er)
      const data = await callEvent('getTicker', input, client)
      expect(data).to.be.deep.equals({ to: 'USD', price: '22' })
    })

    it('should return Promise<Quote> of USD Data is not in cache', async () => {
      const input = {
        symbol: 'BTC',
        to: 'USD'
      }
      await redisClient.flushall()
      const data = await callEvent('getTicker', input, client)
      expect(data).to.be.deep.equals({ to: 'USD', price: '2000' })
    })
  })
})
