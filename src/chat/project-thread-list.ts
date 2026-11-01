import type { RemoteThreadListAdapter } from "@assistant-ui/react";

const PROJECT_CHAT_TITLE = "Engineering project chat";

/**
 * Exposes the project's single durable conversation as a stable remote thread.
 * The history adapter remains responsible for loading/saving the session data;
 * this adapter supplies the remote identity required by assistant-ui's loader.
 */
export function createProjectThreadListAdapter(
  projectId: string,
): RemoteThreadListAdapter {
  if (!projectId.trim()) {
    throw new Error("A project ID is required for the engineering chat thread.");
  }

  const metadata = () => ({
    remoteId: projectId,
    status: "regular" as const,
    title: PROJECT_CHAT_TITLE,
  });

  const assertProjectThread = (remoteId: string) => {
    if (remoteId !== projectId) {
      throw new Error("The requested chat thread does not belong to this project.");
    }
  };

  return {
    async list() {
      return { threads: [metadata()] };
    },

    async initialize() {
      return { remoteId: projectId };
    },

    async rename(remoteId: string) {
      assertProjectThread(remoteId);
      throw new Error("Project-scoped engineering chat threads cannot be renamed.");
    },

    async archive(remoteId: string) {
      assertProjectThread(remoteId);
      throw new Error("Project-scoped engineering chat threads cannot be archived.");
    },

    async delete(remoteId: string) {
      assertProjectThread(remoteId);
      throw new Error("Project-scoped engineering chat threads cannot be deleted.");
    },

    async generateTitle(remoteId: string) {
      assertProjectThread(remoteId);
      throw new Error("The title for a project-scoped engineering chat is fixed.");
    },

    async fetch(remoteId: string) {
      assertProjectThread(remoteId);
      return metadata();
    },
  };
}
