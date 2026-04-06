import request from "supertest";

const hasTestDb = Boolean(process.env.TEST_DATABASE_URL);

describe.skipIf(!hasTestDb)("auth flow e2e", () => {
  it("supports health and auth endpoints in a DB-backed lane", async () => {
    const { createApp } = await import("../../server/app");
    const app = createApp();

    const health = await request(app).get("/api/health");
    expect(health.status).toBe(200);

    const me = await request(app).get("/api/auth/me");
    expect(me.status).toBe(200);
    expect(me.body.user).toBeNull();
  });
});