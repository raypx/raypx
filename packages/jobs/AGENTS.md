# Space routines

/routines owns current Space routine services and injected repository/dispatcher/
secret ports. /routines/postgres owns fenced PostgreSQL persistence. /model and
/client own the editor and Web/Desktop panel. Core owns pure schedules and schemas.
No account/device Cron, Relay executor or cloud-job API remains.

Construction performs no I/O. Current owner membership is checked for automatic
execution. Removed owners pause routines and clear ingress credentials; reassignment
never resumes implicitly. Lock due slots and the conversation counter before
coalescing; use durable occurrence/delivery identity and database time. Ingress
signatures bind delivery ID, event kind and bounded body. Secrets stay encrypted;
webhook keys are digest-only and never exposed by metadata reads. Run check/test
and serial test:postgres against an explicit disposable database.

Schedule previews and routine history show localized minutes with exact ISO time
elements and full localized timestamp tooltips in the selected schedule time zone.
