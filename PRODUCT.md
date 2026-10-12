# Product

## Users

People and teams who research topics, analyze files and turn findings into reviewable reports, spreadsheets and presentations.

## Product Purpose

Voidmix starts as a Web-first cloud AI product. Search reads actual sources and returns attributed answers. Computer performs multi-step work with trusted tools and delivers reports, tables and presentations for user review. Desktop becomes a cloud client first; local execution follows. See [the cloud platform](docs/architecture/cloud-platform.md) for the current execution and publication boundaries.

## Brand Personality

Calm, precise, technical, and collaborative. VoidMix should feel like an Agent Signal Room: multiple capable roles working in one legible system, with enough energy to show live execution without turning the product into a toy.

## Product Principles

1. **Research and delivery.** Search explains evidence; Computer creates useful files. A personal task does not require creating a project.
2. **Show the work.** Agent roles, messages, tool calls, files, steps, and decisions are visible as an understandable conversation, not a black box.
3. **Truthful state.** Running, queued, waiting, failed, cancelled, offline, and unavailable states are explicit. Preview data is never presented as live.
4. **Shared behavior, suitable layouts.** Web centers answers and deliveries, with sources and execution details nearby. Desktop later assembles a denser workbench from the same business components.
5. **Explicit authority and acceptance.** Hosts bind identity and resource scope. Trusted tools use authorized files; the user accepts the current delivery to complete a Task. Credentials, prompts and private file content never enter telemetry.

## Visual Direction

- Use shadcn base-nova Neutral in light and dark modes across all shipped surfaces.
- Preserve the original Logo, favicon and native application icons and their colors.
- Primary actions are black on light surfaces and light on dark surfaces. Ordinary
  statuses use neutral badges plus text/icons; errors use the destructive role.
- Refine typography, alignment, lists, form feedback and real product imagery.
- Support keyboard focus, WCAG 2.2 AA contrast, responsive Web layouts and reduced motion.
- The exact shipped patterns are recorded in [DESIGN.md](DESIGN.md).

## Anti-references

- Decorative neon, glassmorphism, or generic AI gradients without product meaning.
- Fake realtime logs, fake progress, or claims of live sync when unavailable.
- Dense panels without hierarchy, unexplained technical jargon, or color-only status communication.

## Scope Boundaries

Pi supplies isolated Agent sessions, model invocation and event streaming. Voidmix owns authorization, trusted tools, durable Task/Run state, usage reservations, private file publication, review, notification and Web/Desktop composition. Model and search providers, object storage and telemetry are explicit configuration seams. Sandbox code, browser/GUI operations, local devices, scheduling, payments and real-time editing follow separate stages; the first release does not promise them.
