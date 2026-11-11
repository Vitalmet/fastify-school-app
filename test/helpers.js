import helper from "fastify-cli/helper.js";

export async function buildApp() {
  return helper.build(["--options", "-l", "silent", "app.js"], {});
}

export const form = (payload) => ({
  headers: { "content-type": "application/x-www-form-urlencoded" },
  payload: new URLSearchParams(payload).toString(),
});
