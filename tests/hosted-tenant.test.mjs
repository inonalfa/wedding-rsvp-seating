import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { ownerStore } from "../hosted/store.ts";

test("hosted owner reads and writes are scoped, even with overlapping guest IDs", async () => {
  const sql = new DatabaseSync(":memory:");
  try {
    sql.exec("PRAGMA foreign_keys=ON");
    sql.exec(readFileSync(new URL("../hosted/migrations/0001_tenants.sql", import.meta.url), "utf8"));
    sql.exec(`
      INSERT INTO accounts VALUES ('alice', 'a', 0), ('bob', 'b', 0);
      INSERT INTO events VALUES ('first','alice','First','2027-06-10','Asia/Jerusalem',100),
        ('second','bob','Second','2027-06-10','Asia/Jerusalem',100);
      INSERT INTO guests VALUES ('first','same','Fictional Alice Guest',2),
        ('second','same','Fictional Bob Guest',2);
      INSERT INTO seating_tables VALUES ('second','table-1',1,10);
    `);
    const db = {
      prepare(query) {
        const statement = sql.prepare(query);
        return {
          bind(...values) {
            return {
              async first() { return statement.get(...values) ?? null; },
              async all() { return { results: statement.all(...values) }; },
              async run() { return { meta: statement.run(...values) }; },
            };
          },
        };
      },
    };
    const alice = ownerStore(db, "alice", 99);
    const bob = ownerStore(db, "bob", 99);
    assert.deepEqual((await alice.listEvents()).map(event => event.event_id), ["first"]);
    assert.equal(await alice.event("second").details(), null);
    assert.deepEqual(await alice.event("second").guests(), []);
    assert.equal(await alice.event("second").rename("Forbidden"), false);
    assert.equal(await alice.event("second").delete(), false);
    assert.equal((await bob.event("second").details()).title, "Second");
    assert.equal((await bob.event("second").guests())[0].name, "Fictional Bob Guest");
    assert.equal(await alice.event("first").rename("Allowed"), true);
    assert.equal((await alice.event("first").details()).title, "Allowed");
    assert.equal(await ownerStore(db, "alice", 100).event("first").details(), null);
    assert.throws(() => sql.exec("INSERT INTO seating_assignments VALUES ('first','same','table-1')"), /FOREIGN KEY/);
    assert.equal(await alice.event("first").delete(), true);
    assert.equal(sql.prepare("SELECT count(*) AS total FROM guests").get().total, 1);
  } finally {
    sql.close();
  }
});
