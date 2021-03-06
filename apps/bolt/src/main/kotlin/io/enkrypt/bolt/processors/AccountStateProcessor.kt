package io.enkrypt.bolt.processors

import io.enkrypt.bolt.serdes.RLPAccountSerde
import io.enkrypt.bolt.sinks.AccountMongoSink
import mu.KotlinLogging
import org.apache.kafka.common.serialization.Serdes
import org.apache.kafka.streams.KafkaStreams
import org.apache.kafka.streams.KeyValue
import org.apache.kafka.streams.StreamsBuilder
import org.apache.kafka.streams.StreamsConfig
import org.apache.kafka.streams.kstream.Consumed
import org.ethereum.util.ByteUtil
import org.koin.standalone.get
import java.util.Properties

/**
 * This processor processes addresses balances (and if the address is deceased or not).
 */
class AccountStateProcessor : AbstractBaseProcessor() {

  override val id: String = "account-state-processor"

  private val kafkaProps: Properties = Properties(baseKafkaProps)
    .apply {
      putAll(baseKafkaProps.toMap())
      put(StreamsConfig.APPLICATION_ID_CONFIG, id)
      put(StreamsConfig.NUM_STREAM_THREADS_CONFIG, 1)
    }

  private val logger = KotlinLogging.logger {}

  override fun onPrepareProcessor() {
    // RLP Account Serde
    val accountSerde = RLPAccountSerde()

    // Create stream builder
    val builder = StreamsBuilder()

    builder
      .stream(appConfig.topicsConfig.accountState, Consumed.with(Serdes.ByteArray(), accountSerde))
      .map { k, v -> KeyValue(ByteUtil.toHexString(k), v) }
      .process({ get<AccountMongoSink>() }, null)

    // Generate the topology
    val topology = builder.build()

    // Create streams
    streams = KafkaStreams(topology, kafkaProps)
  }

  override fun start() {
    logger.info { "Starting ${this.javaClass.simpleName}..." }
    super.start()
  }

}
