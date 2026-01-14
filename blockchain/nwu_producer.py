from datetime import datetime
import json
import random
from kafka import KafkaProducer  # from kafka-python

BOOTSTRAP_SERVERS = "YOUR_SERVER_IP_OR_DNS:9092"
TOPIC = "nwu.transfers.raw"

producer = KafkaProducer(
    bootstrap_servers=BOOTSTRAP_SERVERS,
    value_serializer=lambda v: json.dumps(v).encode("utf-8"),
)

def send_transfer_event():
    data_types = ["UserBehavior", "FinancialTx", "IoT_Sensor", "RetailHabit"]
    sources = ["EdgeDevice_A", "Enterprise_B", "UserApp_C"]

    event = {
        "event_type": "TRANSFER_CREATED",
        "event_ts": datetime.utcnow().isoformat(),
        "business_date": datetime.utcnow().strftime("%Y-%m-%d"),
        "data_type": random.choice(data_types),
        "volume_gb": round(random.uniform(0.5, 10.0), 2),
        "source": random.choice(sources),
        "estimated_value_usd": round(random.uniform(50, 5000), 2),
        "liquidity_score": round(random.uniform(0.7, 1.0), 2),
        "device": "android-termux",
    }
    future = producer.send(TOPIC, value=event)
    future.get(timeout=10)
    print("Sent event:", event)

if __name__ == "__main__":
    for _ in range(10):
        send_transfer_event()

producer.flush()
producer.close()
