import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

afterEach(() => {
  cleanup();
  if (typeof window !== "undefined") {
    window.history.replaceState(null, "", "/");
    window.localStorage?.clear();
  }
});
