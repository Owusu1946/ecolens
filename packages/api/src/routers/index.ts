import { v1Router } from "./v1/index";

// Every published API version, mounted by the server at /<version>.
// A version is frozen once clients depend on it: breaking changes go into a new
// version (v2, ...) while older ones keep serving until they are retired.
export const routers = {
  v1: v1Router,
};
export type ApiVersion = keyof typeof routers;

export type { V1Router, V1RouterClient } from "./v1/index";
