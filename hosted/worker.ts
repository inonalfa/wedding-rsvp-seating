/** Hosted entry point. Tenant routes are added only after their authorization is in place. */
const worker = {
  fetch(request: Request): Response {
    if (request.method === "GET" && new URL(request.url).pathname === "/health") {
      return Response.json({ status: "ok" }, { headers: { "Cache-Control": "no-store" } });
    }
    return new Response("Not found", { status: 404 });
  },
};

export default worker;
