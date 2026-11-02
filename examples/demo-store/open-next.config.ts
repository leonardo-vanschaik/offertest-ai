import { defineCloudflareConfig } from "@opennextjs/cloudflare";

// Every store page is dynamic (it reads the live scenario), so no incremental cache is needed.
export default defineCloudflareConfig({});
