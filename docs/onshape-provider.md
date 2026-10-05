# Onshape Provider Adapter Layer

The engineering core does not depend directly on an Onshape MCP server.

It requests engineering capabilities such as:
- CAD.CREATE_PART
- CAD.CREATE_DRAWING
- CAD.GET_DRAWING_VIEWS
- CAD.EXPORT_DRAWING

The adapter translates those capabilities into provider-specific MCP tool names.

## Supported adapter targets

### gpambrozio
Maps drawing operations to tools such as onshape_create_drawing, onshape_get_drawing_views, and onshape_export_drawing.

### Casys-AI
Maps drawing operations to tools such as onshape_drawing_create, onshape_drawing_views, and onshape_drawing_export.

## Transport boundary

`OnshapeMcpExecutor` exposes only `call(toolName, input) -> output`.
This keeps the engineering core independent of stdio, HTTP, an MCP client, or another runtime.

The repository currently provides the adapter and mapping layer, not a hard-coded network transport. Authentication, session management, retries, rate limits, and actual MCP process transport belong outside the engineering core.

## Engineering rule

A CAD provider result is not automatically a validated engineering result. Geometry, dimensions, units, references, and downstream manufacturing constraints still require validation before the project advances.