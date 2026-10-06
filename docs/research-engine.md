# V1.5 Research Intelligence

The research layer turns an engineering question into traceable evidence. It is provider-independent: the core knows research contracts, not a specific search service.

## Pipeline
Research question -> provider search -> source normalization -> authority ranking -> finding extraction -> requirement linkage -> engineering interpretation -> evidence/memory.

## Source hierarchy
1. Standards
2. Manufacturer technical documentation
3. Peer-reviewed literature
4. Engineering textbooks
5. Engineering organizations
6. Patents
7. General web

This is a prioritization heuristic, not proof of correctness. A manufacturer document may be the best source for its own component; a standard may be mandatory for a particular design decision.

## Evidence rules
- Every engineering claim should retain source IDs.
- Findings are not automatically VERIFIED.
- Provider output must preserve provenance.
- General web material must not silently become authoritative engineering data.
- Critical numerical inputs should be independently checked against authoritative sources or calculations.
- Missing evidence remains a visible gap rather than being filled by model invention.

## Provider boundary
Future providers can implement the ResearchProvider contract for academic search, manufacturer catalogs and technical manuals, standards repositories, engineering web search, and internal project documents.

The first implementation is a mock provider used only for contract tests. It intentionally labels its finding ASSUMED.

## Next integration
Add real provider adapters while keeping the core unchanged. Candidate adapters include academic search, manufacturer documentation, and controlled web retrieval. Each adapter should normalize title, URI, publisher, source class, retrieval time, and provenance before findings enter engineering memory.
