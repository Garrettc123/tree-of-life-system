import logging

from handlers.stripe_payment import handle as stripe_handler
from handlers.github_ci import handle as github_ci_handler
from handlers.rhns_alert import handle as rhns_handler
from handlers.generic import handle as generic_handler
from supabase_log import EventLog

log = logging.getLogger("router")

ROUTES = {
    "stripe.payment_cleared": stripe_handler,
    "stripe.checkout_session_completed": stripe_handler,
    "stripe.invoice_payment_succeeded": stripe_handler,
    "stripe.payment_intent_succeeded": stripe_handler,
    "github.ci_success": github_ci_handler,
    "github.ci_failure": github_ci_handler,
    "github.push": generic_handler,
    "rhns.alert": rhns_handler,
    "rhns.service_down": rhns_handler,
    "rhns.brief": generic_handler,
}


async def route_event(event: dict, event_id: str, event_log: EventLog):
    event_type = event.get("event_type", "")
    handler = ROUTES.get(event_type, generic_handler)
    try:
        await handler(event, event_id)
        await event_log.mark_processed(event_id)
        log.info("routed event_type=%s event_id=%s", event_type, event_id)
    except Exception as e:
        log.error("route_failed event_type=%s event_id=%s err=%s", event_type, event_id, e)
        await event_log.mark_failed(event_id, str(e))
