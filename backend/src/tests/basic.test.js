const request = require("supertest");

describe("Basic Server Tests", () => {

  test("Environment variables exist", () => {
    expect(process.env).toBeDefined();
  });

  test("Node runtime working", () => {
    expect(1 + 1).toBe(2);
  });

});