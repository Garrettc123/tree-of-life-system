import logging

log = logging.getLogger("handler.generic")


async def handle(event: dict, event_id: str):
    log.info(
        "generic_handler event_id=%s event_type=%s source=%s",
        event_id, event.get("event_type"), event.get("source_system"),
    )
