# @raypx/jobs

## Purpose

Shared browser views for local/cloud jobs.

## Interface

- `/client` owns DOM views and injected ports; apps own routing and authentication.
- `@raypx/jobs-model` owns platform-neutral local/cloud schemas, inferred types,
  errors and pure calendar calculations.

## Boundaries

This browser-targeted workspace imports `@raypx/jobs-model` and must never import
contracts or concrete SDKs. Keep client ports independent of SDK-derived types.
Private view state remounts and in-flight requests abort on account/client changes.
Cloud forms retain edits on CAS errors and require explicit device epoch reselection.
Local automations remain in the Desktop device profile across account changes.

## Verification

Run package checks/tests and both application consumers. SQL persistence, actual
relay round trips and Bun/Nitro scheduled events have separate integration gates.
