import cosyte from "@cosyte/eslint-config";

// The shared defaults plus `examples/`, so the runnable examples are linted with the same
// type-checked rules as the source they demonstrate.
const files = ["src/**/*.ts", "test/**/*.ts", "scripts/**/*.ts", "examples/**/*.ts", "*.config.ts"];

export default [
  ...cosyte(import.meta.dirname, { files }),
  // An example is a program a reader runs, and printing what it did is its job.
  {
    files: ["examples/**/*.ts"],
    rules: {
      "no-console": "off",
    },
  },
];
