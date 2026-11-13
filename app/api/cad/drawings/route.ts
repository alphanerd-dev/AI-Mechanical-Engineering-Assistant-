import { listProjectDrawings, uploadProjectDrawing } from "./service";

export const runtime = "nodejs";

export async function GET(request: Request) {
  return listProjectDrawings(request);
}

export async function POST(request: Request) {
  return uploadProjectDrawing(request);
}
