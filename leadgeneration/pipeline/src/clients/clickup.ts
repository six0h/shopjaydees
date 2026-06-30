import type { ClickUpTask } from "../types.js";
import type { Logger } from "../logger.js";

const BASE_URL = "https://api.clickup.com/api/v2";

export interface ClickUpClient {
  getTasks(
    listId: string,
    opts: {
      statuses?: string[];
      customFields?: Array<{ field_id: string; operator: string; value: string }>;
      includeClosed?: boolean;
    }
  ): Promise<ClickUpTask[]>;

  createTask(
    listId: string,
    task: {
      name: string;
      status: string;
      tags?: string[];
      custom_fields: Array<{ id: string; value: unknown }>;
    }
  ): Promise<ClickUpTask>;

  updateTask(
    taskId: string,
    update: {
      status?: string;
      custom_fields?: Array<{ id: string; value: unknown }>;
      assignees?: { add?: number[]; rem?: number[] };
    }
  ): Promise<ClickUpTask>;

  addComment(taskId: string, text: string): Promise<void>;

  addTag(taskId: string, tag: string): Promise<void>;

  getFields(
    listId: string
  ): Promise<
    Array<{
      id: string;
      name: string;
      type: string;
      type_config?: { options?: Array<{ name: string; orderindex: number }> };
    }>
  >;
}

interface ClickUpClientOptions {
  token: string;
  rateLimit: number;
  fetchFn?: typeof fetch;
  logger: Logger;
}

export function createClickUpClient(options: ClickUpClientOptions): ClickUpClient {
  const fetchFn = options.fetchFn ?? fetch;
  const maxPerMinute = options.rateLimit;
  let requestTimestamps: number[] = [];

  async function throttle(): Promise<void> {
    const now = Date.now();
    requestTimestamps = requestTimestamps.filter((t) => now - t < 60_000);
    if (requestTimestamps.length >= maxPerMinute) {
      const oldest = requestTimestamps[0];
      const waitMs = 60_000 - (now - oldest) + 100;
      await new Promise((resolve) => setTimeout(resolve, waitMs));
      requestTimestamps = requestTimestamps.filter((t) => Date.now() - t < 60_000);
    }
    requestTimestamps.push(Date.now());
  }

  async function request(
    method: string,
    path: string,
    body?: unknown,
    retries = 3
  ): Promise<unknown> {
    await throttle();

    const url = `${BASE_URL}${path}`;
    const opts: RequestInit = {
      method,
      headers: {
        Authorization: options.token,
        "Content-Type": "application/json",
      },
    };
    if (body) {
      opts.body = JSON.stringify(body);
    }

    const response = await fetchFn(url, opts);

    if (response.status === 429 && retries > 0) {
      const retryAfter = parseInt(
        response.headers.get("retry-after") ?? "60",
        10
      );
      options.logger.warn("ClickUp 429 — retrying", {
        retryAfter,
        retriesLeft: retries - 1,
      });
      await new Promise((resolve) =>
        setTimeout(resolve, retryAfter * 1000)
      );
      return request(method, path, body, retries - 1);
    }

    if (response.status >= 500 && retries > 0) {
      options.logger.warn("ClickUp 5xx — retrying", {
        status: response.status,
        retriesLeft: retries - 1,
      });
      await new Promise((resolve) => setTimeout(resolve, 3000));
      return request(method, path, body, retries - 1);
    }

    if (!response.ok) {
      const text = await response.text();
      throw new Error(
        `ClickUp API ${method} ${path} failed: ${response.status} ${text}`
      );
    }

    return response.json();
  }

  return {
    async getTasks(listId, opts) {
      const params = new URLSearchParams();
      params.set("subtasks", "false");
      params.set("page", "0");
      if (opts.statuses) {
        for (const s of opts.statuses) {
          params.append("statuses[]", s);
        }
      }
      if (opts.includeClosed) {
        params.set("include_closed", "true");
      }
      if (opts.customFields) {
        params.set("custom_fields", JSON.stringify(opts.customFields));
      }
      const data = (await request(
        "GET",
        `/list/${listId}/task?${params.toString()}`
      )) as { tasks: ClickUpTask[] };
      return data.tasks;
    },

    async createTask(listId, task) {
      return (await request("POST", `/list/${listId}/task`, task)) as ClickUpTask;
    },

    async updateTask(taskId, update) {
      return (await request("PUT", `/task/${taskId}`, update)) as ClickUpTask;
    },

    async addComment(taskId, text) {
      await request("POST", `/task/${taskId}/comment`, {
        comment_text: text,
      });
    },

    async addTag(taskId, tag) {
      await request("POST", `/task/${taskId}/tag/${encodeURIComponent(tag)}`);
    },

    async getFields(listId) {
      const data = (await request("GET", `/list/${listId}/field`)) as {
        fields: Array<{
          id: string;
          name: string;
          type: string;
          type_config?: {
            options?: Array<{ name: string; orderindex: number }>;
          };
        }>;
      };
      return data.fields;
    },
  };
}
