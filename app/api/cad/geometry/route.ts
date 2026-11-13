import { executeCADGeometryRequest, listCADDisplayDerivatives } from "../../../../src/cad/geometry-api-service";

export const runtime = "nodejs";
export const maxDuration = 150;

export async function GET(request: Request) {
  return listCADDisplayDerivatives(request);
}

export async function POST(request: Request) {
  return executeCADGeometryRequest(request);
}
