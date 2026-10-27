//! oRPC's typed Rust client over the existing authenticated native transport.
//!
//! The upstream RpcLink reads unbounded bodies and uses its own cookie-less HTTP
//! client. This Link keeps every request inside Api's policy boundary. Its small
//! wire adapter handles TS oRPC v2's status-less errors; business payloads stay JSON.
use crate::api::Api;
use ::orpc_client::{Client, ClientError, Link, link::ValueStream};
use orpc::{ErrorCode, ORPCError};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};

#[derive(Serialize, Deserialize)]
struct Envelope<T> {
    json: T,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    meta: Vec<Value>,
}

struct NativeApiLink<'a> {
    api: &'a Api,
}

fn protocol_error(code: &str) -> ClientError {
    // Error messages and data from the remote service never become native diagnostics.
    ClientError::Rpc(ORPCError::new(
        ErrorCode::Custom(code.into()),
        "Native API request failed",
    ))
}

fn transport_error(message: String) -> ClientError {
    protocol_error(match message.as_str() {
        "API path is not permitted" => "RAYPX_API_PATH_NOT_PERMITTED",
        "API request timed out" => "RAYPX_API_TIMEOUT",
        "API response exceeds limit" => "RAYPX_API_RESPONSE_TOO_LARGE",
        "Unable to persist API session; restart required"
        | "Native session storage unavailable; restart required" => "RAYPX_API_SESSION_UNAVAILABLE",
        _ => "RAYPX_API_TRANSPORT",
    })
}

impl Link for NativeApiLink<'_> {
    async fn call(&self, procedure: &str, input: Value) -> Result<Value, ClientError> {
        let path = if procedure.starts_with("/rpc/") {
            procedure.to_owned()
        } else {
            format!("/rpc/{}", procedure.replace('.', "/"))
        };
        let body = serde_json::to_string(&Envelope {
            json: input,
            meta: vec![],
        })
        .map_err(ClientError::Serialize)?;
        let response = self.api.request_internal(json!({"path":path,"method":"POST","headers":{"content-type":"application/json"},"body":body}), true).await.map_err(transport_error)?;
        let status = response["status"]
            .as_u64()
            .ok_or_else(|| protocol_error("RAYPX_API_INVALID_RESPONSE"))?;
        if status == 401 {
            return Err(ClientError::Rpc(ORPCError::unauthorized(
                "Authentication required",
            )));
        }
        if (300..400).contains(&status) {
            return Err(protocol_error("RAYPX_API_INVALID_RESPONSE"));
        }
        let body = response["body"]
            .as_str()
            .ok_or_else(|| protocol_error("RAYPX_API_INVALID_RESPONSE"))?;
        let payload = serde_json::from_str::<Value>(body);
        // A valid oRPC NOT_FOUND is different from an old router's plain HTTP 404.
        let rpc_error = payload
            .as_ref()
            .ok()
            .and_then(|value| value.get("json"))
            .is_some_and(|value| {
                value.get("defined").is_some_and(Value::is_boolean)
                    && value.get("code").is_some_and(Value::is_string)
                    && value.get("message").is_some_and(Value::is_string)
            });
        if status == 404 && !rpc_error {
            return Err(protocol_error("RAYPX_API_MISSING_PROCEDURE"));
        }
        let payload = payload.map_err(ClientError::Deserialize)?;
        if ["meta", "maps", "blobs"].iter().any(|field| {
            payload
                .get(field)
                .is_some_and(|value| !value.as_array().is_some_and(Vec::is_empty))
        }) {
            return Err(protocol_error("RAYPX_API_UNSUPPORTED_SERIALIZATION"));
        }
        let mut envelope: Envelope<Value> =
            serde_json::from_value(payload).map_err(ClientError::Deserialize)?;
        if status >= 400 {
            let error = envelope
                .json
                .as_object_mut()
                .ok_or_else(|| protocol_error("RAYPX_API_INVALID_RESPONSE"))?;
            // TS oRPC 2 removes status from error JSON. HTTP status is authoritative.
            error.insert("status".into(), json!(status));
            let error = serde_json::from_value::<ORPCError>(envelope.json)
                .map_err(ClientError::Deserialize)?;
            return Err(ClientError::Rpc(error));
        }
        Ok(envelope.json)
    }

    async fn subscribe(
        &self,
        _procedure: &str,
        _input: Value,
        _last_event_id: Option<u64>,
    ) -> Result<ValueStream, ClientError> {
        Err(protocol_error("RAYPX_API_UNSUPPORTED_SERIALIZATION"))
    }
}

pub async fn call(api: &Api, procedure: &str, input: Value) -> Result<Value, String> {
    Client::with_link(NativeApiLink { api })
        .call::<_, Value>(procedure, &input)
        .await
        .map_err(|error| {
            let ClientError::Rpc(error) = error else {
                return "Invalid native API response".to_string();
            };
            match error.code.to_string().as_str() {
                "UNAUTHORIZED" => "AUTH_REQUIRED",
                "NOT_FOUND" => "NOT_FOUND",
                "FORBIDDEN" => "FORBIDDEN",
                "BAD_REQUEST" => "BAD_REQUEST",
                "RAYPX_API_MISSING_PROCEDURE" => "MISSING_PROCEDURE",
                "RAYPX_API_PATH_NOT_PERMITTED" => "API path is not permitted",
                "RAYPX_API_TIMEOUT" => "API request timed out",
                "RAYPX_API_RESPONSE_TOO_LARGE" => "API response exceeds limit",
                "RAYPX_API_SESSION_UNAVAILABLE" => {
                    "Native session storage unavailable; restart required"
                }
                "RAYPX_API_INVALID_RESPONSE" => "Invalid native API response",
                "RAYPX_API_UNSUPPORTED_SERIALIZATION" => "Unsupported native API serialization",
                _ => "Native API request failed",
            }
            .to_string()
        })
}
