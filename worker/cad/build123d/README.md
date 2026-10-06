# build123d CAD worker protocol

Transport: one JSON request on stdin and one JSON response on stdout.

Request fields:
- id
- backend: build123d
- source
- filename
- timeoutMs
- parameters (optional)

Response fields:
- success
- backend
- sourceArtifactPath
- solidArtifactPath
- stepArtifactPath
- stlArtifactPath
- threeMfArtifactPath
- stdout
- stderr
- warnings
- error

Security boundary:
- run outside the Next.js process
- non-root container
- no network
- read-only source environment plus artifact directory
- CPU, memory, PID and timeout limits enforced by the outer supervisor
- generated source is never executed directly by the web server
- production deployment must pin the build123d dependency version