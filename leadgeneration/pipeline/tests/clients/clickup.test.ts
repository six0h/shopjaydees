import { describe, it, expect, vi, beforeEach } from "vitest";
import { createClickUpClient, type ClickUpClient } from "../../src/clients/clickup.js";
import { createLogger } from "../../src/logger.js";

function mockFetchResponses(...responses: Array<{ status: number; body: unknown }>) {
  const fn = vi.fn();
  for (const r of responses) {
    fn.mockResolvedValueOnce({
      ok: r.status >= 200 && r.status < 300,
      status: r.status,
      headers: new Headers({ "x-ratelimit-remaining": "50" }),
      json: () => Promise.resolve(r.body),
      text: () => Promise.resolve(JSON.stringify(r.body)),
    });
  }
  return fn;
}

describe("ClickUpClient", () => {
  const logger = createLogger("test");
  vi.spyOn(console, "log").mockImplementation(() => {});

  describe("getTasks", () => {
    it("fetches tasks from a list with status filter", async () => {
      const mockFetch = mockFetchResponses({
        status: 200,
        body: { tasks: [{ id: "t1", name: "Test", status: { status: "Requested" }, custom_fields: [], tags: [] }] },
      });
      const client = createClickUpClient({
        token: "pk_test",
        rateLimit: 90,
        fetchFn: mockFetch,
        logger,
      });

      const tasks = await client.getTasks("list123", { statuses: ["Requested"] });

      expect(tasks).toHaveLength(1);
      expect(tasks[0].id).toBe("t1");
      const [url] = mockFetch.mock.calls[0];
      expect(url).toContain("list/list123/task");
      expect(url).toContain("statuses%5B%5D=Requested");
    });

    it("includes closed tasks when requested", async () => {
      const mockFetch = mockFetchResponses({
        status: 200,
        body: { tasks: [] },
      });
      const client = createClickUpClient({
        token: "pk_test",
        rateLimit: 90,
        fetchFn: mockFetch,
        logger,
      });

      await client.getTasks("list123", { includeClosed: true });

      const [url] = mockFetch.mock.calls[0];
      expect(url).toContain("include_closed=true");
    });

    it("supports custom_fields filter for dedup", async () => {
      const mockFetch = mockFetchResponses({
        status: 200,
        body: { tasks: [] },
      });
      const client = createClickUpClient({
        token: "pk_test",
        rateLimit: 90,
        fetchFn: mockFetch,
        logger,
      });

      await client.getTasks("list123", {
        customFields: [{ field_id: "f1", operator: "=", value: "https://example.com" }],
        includeClosed: true,
      });

      const [url] = mockFetch.mock.calls[0];
      expect(url).toContain("custom_fields=");
    });
  });

  describe("createTask", () => {
    it("creates a task with custom fields", async () => {
      const mockFetch = mockFetchResponses({
        status: 200,
        body: { id: "new_task", name: "Test Co — Jane", status: { status: "Enriched" } },
      });
      const client = createClickUpClient({
        token: "pk_test",
        rateLimit: 90,
        fetchFn: mockFetch,
        logger,
      });

      const result = await client.createTask("list123", {
        name: "Test Co — Jane",
        status: "Enriched",
        custom_fields: [{ id: "f1", value: "Test Co" }],
      });

      expect(result.id).toBe("new_task");
      const [, opts] = mockFetch.mock.calls[0];
      expect(opts.method).toBe("POST");
      const body = JSON.parse(opts.body);
      expect(body.name).toBe("Test Co — Jane");
      expect(body.status).toBe("Enriched");
    });
  });

  describe("updateTask", () => {
    it("updates task status and custom fields", async () => {
      const mockFetch = mockFetchResponses(
        { status: 200, body: { id: "t1", status: { status: "Complete" } } },
        { status: 200, body: {} }
      );
      const client = createClickUpClient({
        token: "pk_test",
        rateLimit: 90,
        fetchFn: mockFetch,
        logger,
      });

      await client.updateTask("t1", {
        status: "Complete",
        custom_fields: [{ id: "f1", value: 25 }],
      });

      const [url, opts] = mockFetch.mock.calls[0];
      expect(url).toContain("task/t1");
      expect(opts.method).toBe("PUT");

      // The custom field lands via its own POST, not the PUT body.
      const [fieldUrl, fieldOpts] = mockFetch.mock.calls[1];
      expect(fieldUrl).toContain("/task/t1/field/f1");
      expect(fieldOpts.method).toBe("POST");
      expect(JSON.parse(fieldOpts.body)).toEqual({ value: 25 });
    });

    it("forwards assignees in the updateTask PUT body", async () => {
      const mockFetch = mockFetchResponses({ status: 200, body: { id: "t1" } });
      const client = createClickUpClient({ token: "tok", rateLimit: 90, fetchFn: mockFetch, logger });

      await client.updateTask("t1", { status: "Responded - Owner Follow-up", assignees: { add: [42] } });

      const [, options] = mockFetch.mock.calls[0];
      const body = JSON.parse(options.body);
      expect(body.assignees).toEqual({ add: [42] });
      expect(body.status).toBe("Responded - Owner Follow-up");
    });
  });

  describe("addComment", () => {
    it("posts a comment to a task", async () => {
      const mockFetch = mockFetchResponses({
        status: 200,
        body: { id: "comment1" },
      });
      const client = createClickUpClient({
        token: "pk_test",
        rateLimit: 90,
        fetchFn: mockFetch,
        logger,
      });

      await client.addComment("t1", "Completed: 10 leads created");

      const [url, opts] = mockFetch.mock.calls[0];
      expect(url).toContain("task/t1/comment");
      expect(opts.method).toBe("POST");
      const body = JSON.parse(opts.body);
      expect(body.comment_text).toBe("Completed: 10 leads created");
    });
  });

  describe("rate limiting", () => {
    it("retries on 429 with delay", async () => {
      const mockFetch = vi.fn()
        .mockResolvedValueOnce({
          ok: false,
          status: 429,
          headers: new Headers({ "retry-after": "1" }),
          text: () => Promise.resolve("rate limited"),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          headers: new Headers({ "x-ratelimit-remaining": "50" }),
          json: () => Promise.resolve({ tasks: [] }),
          text: () => Promise.resolve("{}"),
        });

      const client = createClickUpClient({
        token: "pk_test",
        rateLimit: 90,
        fetchFn: mockFetch,
        logger,
      });

      const tasks = await client.getTasks("list123", {});

      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(tasks).toEqual([]);
    });
  });

  describe("getFields", () => {
    it("fetches custom fields for a list", async () => {
      const mockFetch = mockFetchResponses({
        status: 200,
        body: {
          fields: [
            { id: "f1", name: "Segment", type: "drop_down", type_config: { options: [{ name: "Business", orderindex: 0 }] } },
          ],
        },
      });
      const client = createClickUpClient({
        token: "pk_test",
        rateLimit: 90,
        fetchFn: mockFetch,
        logger,
      });

      const fields = await client.getFields("list123");

      expect(fields).toHaveLength(1);
      expect(fields[0].name).toBe("Segment");
    });
  });
});

describe("updateTask custom_fields", () => {
  const logger = createLogger("test");

  it("sets each custom field via POST /task/:id/field/:fieldId, not PUT /task/:id", async () => {
    // ClickUp v2 silently ignores custom_fields on PUT /task/:id.
    const mockFetch = mockFetchResponses(
      { status: 200, body: { id: "t1", custom_fields: [] } }, // PUT
      { status: 200, body: {} }, // POST field f1
      { status: 200, body: {} } // POST field f2
    );
    const client = createClickUpClient({
      token: "pk_test",
      rateLimit: 90,
      fetchFn: mockFetch,
      logger,
    });

    await client.updateTask("t1", {
      status: "Ready for Review",
      custom_fields: [
        { id: "f1", value: "draft body" },
        { id: "f2", value: 7 },
      ],
    });

    const calls = mockFetch.mock.calls;
    expect(calls).toHaveLength(3);

    // 1. PUT carries the status but NOT custom_fields
    const [putUrl, putOpts] = calls[0];
    expect(putUrl).toContain("/task/t1");
    expect(putOpts.method).toBe("PUT");
    const putBody = JSON.parse(putOpts.body);
    expect(putBody.status).toBe("Ready for Review");
    expect(putBody.custom_fields).toBeUndefined();

    // 2+3. One POST per field, value wrapped in { value }
    const [f1Url, f1Opts] = calls[1];
    expect(f1Url).toContain("/task/t1/field/f1");
    expect(f1Opts.method).toBe("POST");
    expect(JSON.parse(f1Opts.body)).toEqual({ value: "draft body" });

    const [f2Url, f2Opts] = calls[2];
    expect(f2Url).toContain("/task/t1/field/f2");
    expect(JSON.parse(f2Opts.body)).toEqual({ value: 7 });
  });

  it("skips the PUT entirely when only custom_fields are supplied", async () => {
    const mockFetch = mockFetchResponses({ status: 200, body: {} });
    const client = createClickUpClient({
      token: "pk_test",
      rateLimit: 90,
      fetchFn: mockFetch,
      logger,
    });

    await client.updateTask("t1", { custom_fields: [{ id: "f1", value: "x" }] });

    expect(mockFetch.mock.calls).toHaveLength(1);
    expect(mockFetch.mock.calls[0][0]).toContain("/task/t1/field/f1");
    expect(mockFetch.mock.calls[0][1].method).toBe("POST");
  });
});
