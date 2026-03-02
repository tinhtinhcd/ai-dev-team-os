import { getHealth } from "../../../../../gateway";

export async function GET() {
  const health = getHealth();
  return Response.json(health);
}
