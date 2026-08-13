from opentelemetry.proto.collector.trace.v1.trace_service_pb2 import ExportTraceServiceRequest
from opentelemetry.proto.common.v1.common_pb2 import AnyValue, KeyValue
from opentelemetry.proto.resource.v1.resource_pb2 import Resource
from opentelemetry.proto.trace.v1.trace_pb2 import ResourceSpans, ScopeSpans, Span, Status


def test_otlp_protobuf_from_sdk_is_accepted(client, sdk_headers, ui_headers):
    resource = Resource(
        attributes=[
            KeyValue(key="agentalize.agent.id", value=AnyValue(string_value="otlp-agent")),
            KeyValue(key="service.name", value=AnyValue(string_value="OTLP Demo Agent")),
            KeyValue(key="deployment.environment", value=AnyValue(string_value="production")),
        ]
    )
    span = Span(
        trace_id=bytes.fromhex("00112233445566778899aabbccddeeff"),
        span_id=bytes.fromhex("0011223344556677"),
        name="agent.run",
        start_time_unix_nano=1_800_000_000_000_000_000,
        end_time_unix_nano=1_800_000_001_000_000_000,
        status=Status(code=Status.STATUS_CODE_OK),
        attributes=[KeyValue(key="llm.usage.total_tokens", value=AnyValue(int_value=11))],
    )
    request = ExportTraceServiceRequest(
        resource_spans=[ResourceSpans(resource=resource, scope_spans=[ScopeSpans(spans=[span])])]
    )
    response = client.post(
        "/api/v1/traces",
        headers={**sdk_headers, "content-type": "application/x-protobuf"},
        content=request.SerializeToString(),
    )
    assert response.status_code == 200, response.text
    run = client.get(
        "/api/v1/runs/00112233445566778899aabbccddeeff", headers=ui_headers
    )
    assert run.status_code == 200
    assert run.json()["totalTokens"] == 11

