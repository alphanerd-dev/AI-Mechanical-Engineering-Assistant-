export interface CADNativeModelReference {
  /** Stable provider identifier, e.g. "onshape", "freecad", or "build123d". */
  providerId: string;
  /** Provider-native document/container identifier. */
  documentId: string;
  /** Provider-native model identifier within the document. */
  modelId: string;
  /** Optional provider-native URL or URI; not used as the identity key. */
  uri?: string;
}

export interface CADModelIdentity {
  /** Stable Engineering Core identifier, independent of any one CAD vendor. */
  id: string;
  projectId: string;
  name: string;
  /** Multiple provider references may point to this same canonical model. */
  nativeReferences: CADNativeModelReference[];
  createdAt: string;
  updatedAt: string;
}

export interface CADIdentityValidation {
  status: "PASS" | "FAIL";
  errors: string[];
  warnings: string[];
}

export type CADIdentityOperationStatus =
  | "REGISTERED"
  | "LINKED"
  | "ALREADY_LINKED"
  | "REJECTED";

export interface CADIdentityOperationResult {
  status: CADIdentityOperationStatus;
  errors: string[];
  identity?: CADModelIdentity;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function validDate(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0 && !Number.isNaN(Date.parse(value));
}

function normalizedReference(value: CADNativeModelReference): CADNativeModelReference {
  return {
    providerId: value.providerId.trim(),
    documentId: value.documentId.trim(),
    modelId: value.modelId.trim(),
    ...(value.uri === undefined ? {} : { uri: value.uri.trim() })
  };
}

/** Provider-native identity deliberately excludes revision/workspace selectors. */
function nativeModelKey(reference: CADNativeModelReference): string {
  return JSON.stringify([
    reference.providerId.trim(),
    reference.documentId.trim(),
    reference.modelId.trim()
  ]);
}

function copyIdentity(identity: CADModelIdentity): CADModelIdentity {
  return {
    ...identity,
    nativeReferences: identity.nativeReferences.map((reference) => ({ ...reference }))
  };
}

export function validateCADNativeModelReference(value: unknown): CADIdentityValidation {
  const errors: string[] = [];
  if (!isRecord(value)) {
    return { status: "FAIL", errors: ["CAD native model reference must be an object."], warnings: [] };
  }
  for (const key of ["providerId", "documentId", "modelId"] as const) {
    if (!nonEmptyString(value[key])) {
      errors.push(`CAD native model reference ${key} is required.`);
    }
  }
  if (value.uri !== undefined && !nonEmptyString(value.uri)) {
    errors.push("CAD native model reference uri must be a non-empty string when supplied.");
  }
  return { status: errors.length ? "FAIL" : "PASS", errors, warnings: [] };
}

export function validateCADModelIdentity(
  value: unknown,
  expectedProjectId?: string
): CADIdentityValidation {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!isRecord(value)) {
    return { status: "FAIL", errors: ["CAD model identity must be an object."], warnings };
  }

  for (const key of ["id", "projectId", "name"] as const) {
    if (!nonEmptyString(value[key])) errors.push(`CAD model identity ${key} is required.`);
  }
  if (expectedProjectId !== undefined) {
    if (!nonEmptyString(expectedProjectId)) errors.push("Expected project id must be a non-empty string.");
    else if (nonEmptyString(value.projectId) && value.projectId !== expectedProjectId) {
      errors.push("CAD model identity belongs to a different project.");
    }
  }

  if (!validDate(value.createdAt)) errors.push("CAD model identity createdAt must be a valid date string.");
  if (!validDate(value.updatedAt)) errors.push("CAD model identity updatedAt must be a valid date string.");
  if (
    validDate(value.createdAt) &&
    validDate(value.updatedAt) &&
    Date.parse(value.updatedAt) < Date.parse(value.createdAt)
  ) {
    errors.push("CAD model identity updatedAt cannot precede createdAt.");
  }

  if (!Array.isArray(value.nativeReferences)) {
    errors.push("CAD model identity nativeReferences must be an array.");
  } else {
    const references = new Set<string>();
    value.nativeReferences.forEach((reference, index) => {
      const validation = validateCADNativeModelReference(reference);
      for (const error of validation.errors) {
        errors.push(`nativeReferences[${index}]: ${error}`);
      }
      if (validation.status === "PASS") {
        const key = nativeModelKey(normalizedReference(reference as CADNativeModelReference));
        if (references.has(key)) errors.push("CAD model identity contains a duplicate native model reference.");
        references.add(key);
      }
    });
    if (value.nativeReferences.length === 0) {
      warnings.push("CAD model identity has no linked native CAD provider reference yet.");
    }
  }

  return { status: errors.length ? "FAIL" : "PASS", errors, warnings };
}

/**
 * In-memory reference registry for canonical, project-scoped CAD model identities.
 * This does not synchronize geometry or claim that provider-native models are equivalent.
 */
export class CADModelIdentityRegistry {
  private readonly identities = new Map<string, CADModelIdentity>();
  private readonly nativeIndex = new Map<string, string>();

  register(value: unknown, expectedProjectId?: string): CADIdentityOperationResult {
    const validation = validateCADModelIdentity(value, expectedProjectId);
    if (validation.status === "FAIL") {
      return { status: "REJECTED", errors: validation.errors };
    }

    const identity = value as CADModelIdentity;
    if (this.identities.has(identity.id)) {
      return { status: "REJECTED", errors: [`CAD model identity already registered: ${identity.id}.`] };
    }

    const normalized = copyIdentity({
      ...identity,
      id: identity.id.trim(),
      projectId: identity.projectId.trim(),
      name: identity.name.trim(),
      nativeReferences: identity.nativeReferences.map(normalizedReference)
    });
    for (const reference of normalized.nativeReferences) {
      const existingId = this.nativeIndex.get(nativeModelKey(reference));
      if (existingId !== undefined) {
        return {
          status: "REJECTED",
          errors: [`Native CAD model reference is already linked to canonical model ${existingId}.`]
        };
      }
    }

    this.identities.set(normalized.id, normalized);
    for (const reference of normalized.nativeReferences) {
      this.nativeIndex.set(nativeModelKey(reference), normalized.id);
    }
    return { status: "REGISTERED", errors: [], identity: copyIdentity(normalized) };
  }

  linkNativeReference(
    modelId: string,
    projectId: string,
    value: unknown,
    updatedAt: string
  ): CADIdentityOperationResult {
    const identity = this.identities.get(modelId);
    if (!identity) {
      return { status: "REJECTED", errors: [`CAD model identity not found: ${modelId}.`] };
    }
    if (identity.projectId !== projectId) {
      return { status: "REJECTED", errors: ["CAD model identity belongs to a different project."] };
    }

    const referenceValidation = validateCADNativeModelReference(value);
    const errors = [...referenceValidation.errors];
    if (!validDate(updatedAt)) errors.push("updatedAt must be a valid date string.");
    else if (Date.parse(updatedAt) < Date.parse(identity.createdAt)) {
      errors.push("updatedAt cannot precede the CAD model identity createdAt timestamp.");
    }
    if (errors.length) return { status: "REJECTED", errors };

    const reference = normalizedReference(value as CADNativeModelReference);
    const key = nativeModelKey(reference);
    const existingId = this.nativeIndex.get(key);
    if (existingId !== undefined) {
      if (existingId === modelId) {
        return { status: "ALREADY_LINKED", errors: [], identity: copyIdentity(identity) };
      }
      return {
        status: "REJECTED",
        errors: [`Native CAD model reference is already linked to canonical model ${existingId}.`]
      };
    }

    const updated: CADModelIdentity = {
      ...identity,
      nativeReferences: [...identity.nativeReferences, reference],
      updatedAt
    };
    const validation = validateCADModelIdentity(updated, projectId);
    if (validation.status === "FAIL") return { status: "REJECTED", errors: validation.errors };

    this.identities.set(modelId, updated);
    this.nativeIndex.set(key, modelId);
    return { status: "LINKED", errors: [], identity: copyIdentity(updated) };
  }

  resolveById(modelId: string, projectId: string): CADModelIdentity | undefined {
    const identity = this.identities.get(modelId);
    if (!identity || identity.projectId !== projectId) return undefined;
    return copyIdentity(identity);
  }

  resolveByNativeReference(
    value: unknown,
    projectId: string
  ): CADModelIdentity | undefined {
    if (validateCADNativeModelReference(value).status === "FAIL") return undefined;
    const modelId = this.nativeIndex.get(nativeModelKey(value as CADNativeModelReference));
    if (!modelId) return undefined;
    return this.resolveById(modelId, projectId);
  }

  list(projectId: string): CADModelIdentity[] {
    if (!nonEmptyString(projectId)) return [];
    return [...this.identities.values()]
      .filter((identity) => identity.projectId === projectId)
      .map(copyIdentity);
  }
}
