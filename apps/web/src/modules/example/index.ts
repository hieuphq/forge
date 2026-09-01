/**
 * Public entry point of the `example` module (TASK-013). Outside
 * consumers must import through here, never reach into
 * `./use-example-items` or `./example-item-form` directly — the data
 * hook stays module-private per the plan.
 */
export { ExampleItemForm } from "./example-item-form";
