import { describe, expect, it } from "vitest";
import { createProjectThreadListAdapter } from "../src/chat/project-thread-list.js";

describe("project-scoped engineering chat thread adapter", () => {
  const projectId = "d5ff4e76-6fb4-48c6-94ec-88232df79f78";

  it("exposes one stable remote thread for the project", async () => {
    const adapter = createProjectThreadListAdapter(projectId);

    expect(await adapter.list()).toEqual({
      threads: [{
        remoteId: projectId,
        status: "regular",
        title: "Engineering project chat",
      }],
    });
    expect(await adapter.initialize("local-thread-id")).toEqual({
      remoteId: projectId,
    });
    expect(await adapter.fetch(projectId)).toEqual({
      remoteId: projectId,
      status: "regular",
      title: "Engineering project chat",
    });
  });

  it("rejects thread IDs belonging to another project", async () => {
    const adapter = createProjectThreadListAdapter(projectId);

    await expect(adapter.fetch("another-project")).rejects.toThrow(
      "The requested chat thread does not belong to this project.",
    );
  });

  it("does not allow project chat metadata operations to delete or archive the project thread", async () => {
    const adapter = createProjectThreadListAdapter(projectId);

    await expect(adapter.archive(projectId)).rejects.toThrow(
      "Project-scoped engineering chat threads cannot be archived.",
    );
    await expect(adapter.delete(projectId)).rejects.toThrow(
      "Project-scoped engineering chat threads cannot be deleted.",
    );
  });
});
