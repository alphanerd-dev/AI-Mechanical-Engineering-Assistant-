# Engineering Computation

The computation layer provides deterministic, auditable numerical operations behind the AI Engineering Core.

## Principles

1. The model plans computations; deterministic providers execute them.
2. Units and dimensions are checked before engineering results are accepted.
3. Every computation returns provenance: inputs, assumptions, equation, provider, and result status.
4. Mathematical correctness does not establish engineering correctness.
5. External engines such as Wolfram and SageMath remain provider boundaries rather than becoming core dependencies.
6. Generated code must never be executed as arbitrary model-generated code inside the application server.

## Provider roadmap

- Pint: production unit/dimension engine.
- SymPy: symbolic mathematics.
- NumPy/SciPy: numerical mathematics and optimization.
- SageMath: specialist CAS provider.
- Wolfram: external independent calculation/verification provider.

The current TypeScript unit provider is deliberately small and deterministic. It is a development boundary, not a replacement for Pint.