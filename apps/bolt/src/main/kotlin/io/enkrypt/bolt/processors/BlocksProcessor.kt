package io.enkrypt.bolt.processors

import io.enkrypt.bolt.extensions.toHex
import io.enkrypt.bolt.models.BlockStats
import io.enkrypt.bolt.serdes.RLPBlockSummarySerde
import io.enkrypt.bolt.sinks.BlockMongoSink
import mu.KotlinLogging
import org.apache.kafka.common.serialization.Serdes
import org.apache.kafka.streams.KafkaStreams
import org.apache.kafka.streams.KeyValue
import org.apache.kafka.streams.StreamsBuilder
import org.apache.kafka.streams.StreamsConfig
import org.apache.kafka.streams.kstream.Consumed
import org.apache.kafka.streams.kstream.Serialized
import org.ethereum.core.BlockSummary
import org.ethereum.core.TransactionExecutionSummary
import org.ethereum.util.ByteUtil
import org.joda.time.DateTime
import org.joda.time.Period
import org.koin.standalone.get
import java.math.BigInteger
import java.util.Properties

/**
 * This processor process Blocks and Txs at the same time. It calculates also block stats.
 */
class BlocksProcessor : AbstractBaseProcessor() {

  override val id: String = "blocks-processor"

  private val kafkaProps: Properties = Properties()
    .apply {
      putAll(baseKafkaProps.toMap())
      put(StreamsConfig.APPLICATION_ID_CONFIG, id)
      put(StreamsConfig.NUM_STREAM_THREADS_CONFIG, 1)
    }

  private val logger = KotlinLogging.logger {}

  override fun onPrepareProcessor() {
    // RLP Serde
    val blockSerde = RLPBlockSummarySerde()

    // Create stream builder
    val builder = StreamsBuilder()

    val blocks = builder
      .stream(appConfig.topicsConfig.blocks, Consumed.with(Serdes.ByteArray(), blockSerde))
      .map { k, v -> KeyValue(ByteUtil.byteArrayToLong(k), v) }
      .map(::calculateStatistics)
      .process({ get<BlockMongoSink>() }, null)

    // Generate the topology
    val topology = builder.build()

    // Create streams
    streams = KafkaStreams(topology, kafkaProps)
  }

  private fun calculateStatistics(number: Long, summary: BlockSummary): KeyValue<Long, Pair<BlockSummary, BlockStats>> {
    val block = summary.block
    val receipts = summary.receipts

    val blockTimeMs = Period(block.timestamp, DateTime.now().millis).millis // TODO: Review if this calculation is correct
    var successfulTxs = 0
    var failedTxs = 0
    var totalInternalTxs = 0
    val totalTxs = receipts.size
    val totalGasPrice = BigInteger.valueOf(0L)
    val totalTxsFees = BigInteger.valueOf(0L)
    var avgGasPrice = BigInteger.ZERO
    var avgTxsFees = BigInteger.ZERO

    receipts.forEach { receipt ->
      val transaction = receipt.transaction
      val txSummary: TransactionExecutionSummary? = summary.summaries.find { transaction.hash.toHex() == it.transaction.hash.toHex() }

      when {
        receipt.isTxStatusOK -> successfulTxs += 1
        else -> failedTxs += 1
      }

      val gasPrice = ByteUtil.bytesToBigInteger(transaction.gasPrice)
      val gasUsed = ByteUtil.bytesToBigInteger(receipt.gasUsed)

      totalGasPrice.add(gasPrice)

      val txFee = gasUsed.times(gasPrice)
      totalTxsFees.add(txFee)

      if (totalTxs > 0) {
        val total = totalTxs.toBigInteger()
        avgGasPrice = totalGasPrice.divide(total)
        avgTxsFees = totalTxsFees.divide(total)
      }

      val internalTxs = txSummary?.internalTransactions ?: emptyList()
      totalInternalTxs += internalTxs.size
    }

    val stats = BlockStats(
      blockTimeMs,
      successfulTxs,
      failedTxs,
      totalTxs,
      totalInternalTxs,
      totalGasPrice,
      avgGasPrice,
      totalTxsFees,
      avgTxsFees
    )

    return KeyValue(number, Pair(summary, stats))
  }

  override fun start() {
    logger.info { "Starting ${this.javaClass.simpleName}..." }
    super.start()
  }
}




