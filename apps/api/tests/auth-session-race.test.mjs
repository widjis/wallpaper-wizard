import assert from "node:assert/strict";
import { after, beforeEach, test } from "node:test";

// Explicit disposable loopback database only; never use the application's URL.
const testUrl = process.env.AUTH_RACE_TEST_DATABASE_URL;
assert.ok(testUrl, "Set AUTH_RACE_TEST_DATABASE_URL to a disposable PostgreSQL database");
const target = new URL(testUrl);
assert.ok(["postgres:", "postgresql:"].includes(target.protocol));
assert.equal(target.search, "", "Test URL must not override host/schema through query parameters");
assert.ok(["127.0.0.1", "localhost", "[::1]"].includes(target.hostname));
assert.equal(target.pathname, "/cwcm_auth_race_test");
assert.ok(target.port && target.port !== "5432", "Use an isolated non-default port");
await import("../src/config.js");
process.env.POSTGRES_APP_URL = testUrl;
const { prisma } = await import("../src/prisma.js");
const { directory, InvalidLogin } = await import("../src/directory.js");
const { loginWithAssignedAuth, updateUserRecord, getSessionByToken, deleteUserRecord } =
  await import("../src/repository.js");

function gate() {
  let release;
  const promise = new Promise((resolve) => {
    release = resolve;
  });
  return { promise, release };
}

beforeEach(async () => {
  await prisma.session.deleteMany();
  await prisma.activityLog.deleteMany();
  await prisma.user.deleteMany();
  await prisma.user.create({
    data: {
      id: "race-person",
      username: "person",
      authSource: "AD",
      adObjectId: "test-guid",
      passwordHash: "unused",
      role: "OPERATOR",
      isActive: true,
    },
  });
});
after(async () => {
  await prisma.$disconnect();
});

function adminUpdate(overrides = {}) {
  return updateUserRecord({
    userId: "race-person",
    username: "person",
    authSource: "LOCAL",
    password: "isolated-local-test-password",
    role: "OPERATOR",
    isActive: true,
    updatedById: "test-admin",
    ...overrides,
  });
}

// Pause after the exact final validation read, whether it is outside or inside
// a transaction. Every query still executes against real PostgreSQL/Prisma.
function pauseValidationRead(t) {
  const read = gate();
  const resume = gate();
  let armed = true;
  const intercept =
    (original) =>
    async (...args) => {
      const result = await original(...args);
      if (armed) {
        armed = false;
        read.release();
        await resume.promise;
      }
      return result;
    };
  const originalFind = prisma.user.findUnique.bind(prisma.user);
  Object.assign(prisma.user, { findUnique: intercept(originalFind) });
  t.after(() => Object.assign(prisma.user, { findUnique: originalFind }));
  const transaction = prisma.$transaction.bind(prisma);
  t.after(() => Object.assign(prisma, { $transaction: transaction }));
  Object.assign(prisma, {
    $transaction: (callback, options) =>
      transaction((tx) => {
        const user = new Proxy(tx.user, {
          get(model, key) {
            if (key === "findUnique") return intercept(model.findUnique.bind(model));
            const value = model[key];
            return typeof value === "function" ? value.bind(model) : value;
          },
        });
        return callback(
          new Proxy(tx, {
            get(db, key) {
              if (key === "user") return user;
              const value = db[key];
              return typeof value === "function" ? value.bind(db) : value;
            },
          }),
        );
      }, options),
  });
  return { read, resume };
}

test("Successful login does not reset an account's authentication revision", async (t) => {
  t.mock.method(directory, "authenticate", async () => {});
  const revision = new Date("2100-01-01T00:00:00Z");
  await prisma.user.update({ where: { id: "race-person" }, data: { updatedAt: revision } });
  const login = await loginWithAssignedAuth("person", "isolated-ad-test-password");
  assert.ok(await getSessionByToken(login.token));
  const current = await prisma.user.findUnique({ where: { id: "race-person" } });
  assert.equal(current.updatedAt.getTime(), revision.getTime());
  assert.ok(current.lastLoginAt);
});

test("Revocation advances the account revision even when the wall clock moves backwards", async () => {
  const revision = new Date("2100-01-01T00:00:00Z");
  await prisma.user.update({ where: { id: "race-person" }, data: { updatedAt: revision } });
  await adminUpdate({ authSource: "AD", password: undefined });
  const changed = await prisma.user.findUnique({ where: { id: "race-person" } });
  assert.ok(
    changed.updatedAt > revision,
    "account revision must strictly advance on every revocation",
  );
});

test(
  "AD authentication cannot survive source conversion after its final account read",
  { timeout: 10000 },
  async (t) => {
    t.mock.method(directory, "authenticate", async () => {});
    const { read, resume } = pauseValidationRead(t);
    const pending = loginWithAssignedAuth("person", "isolated-ad-test-password");
    // Attach the rejection handler immediately, before releasing the barrier.
    const outcome = pending.then(
      (value) => ({ value }),
      (error) => ({ error }),
    );
    await read.promise;
    try {
      await adminUpdate();
    } finally {
      resume.release();
    }
    const result = await outcome;
    const accepted = result.value ? await getSessionByToken(result.value.token) : null;
    assert.equal(accepted, null, "stale AD credentials issued a usable session after revocation");
    assert.ok(result.error instanceof InvalidLogin);
    assert.equal(await prisma.session.count({ where: { revokedAt: null } }), 0);
  },
);

for (const [name, change] of [
  ["disable", () => adminUpdate({ authSource: "AD", password: undefined, isActive: false })],
  ["role change", () => adminUpdate({ authSource: "AD", password: undefined, role: "VIEWER" })],
  ["no-op save revoking access", () => adminUpdate({ authSource: "AD", password: undefined })],
  ["deletion", () => deleteUserRecord({ userId: "race-person", deletedById: "test-admin" })],
]) {
  test(
    `Concurrent ${name} rejects authentication after its final read`,
    { timeout: 10000 },
    async (t) => {
      t.mock.method(directory, "authenticate", async () => {});
      const { read, resume } = pauseValidationRead(t);
      const outcome = loginWithAssignedAuth("person", "isolated-ad-test-password").then(
        (value) => ({ value }),
        (error) => ({ error }),
      );
      await read.promise;
      try {
        await change();
      } finally {
        resume.release();
      }
      const result = await outcome;
      assert.ok(result.error instanceof InvalidLogin);
      assert.equal(
        await prisma.session.count(),
        0,
        "no session may leak from the rolled-back transaction",
      );
      const user = await prisma.user.findUnique({ where: { id: "race-person" } });
      assert.equal(user.lastLoginAt, null, "failed login must not update lastLoginAt");
    },
  );
}

test("An account update completed during AD bind invalidates the authenticated revision", async (t) => {
  const bound = gate();
  const resume = gate();
  t.mock.method(directory, "authenticate", async () => {
    bound.release();
    await resume.promise;
  });
  const outcome = loginWithAssignedAuth("person", "isolated-ad-test-password").then(
    (value) => ({ value }),
    (error) => ({ error }),
  );
  await bound.promise;
  try {
    await adminUpdate({ authSource: "AD", password: undefined });
  } finally {
    resume.release();
  }
  assert.ok((await outcome).error instanceof InvalidLogin);
  assert.equal(await prisma.session.count(), 0);
});

test(
  "Local password reset races also reject already-verified old credentials",
  { timeout: 10000 },
  async (t) => {
    await adminUpdate();
    const { read, resume } = pauseValidationRead(t);
    const outcome = loginWithAssignedAuth("person", "isolated-local-test-password").then(
      (value) => ({ value }),
      (error) => ({ error }),
    );
    await read.promise;
    try {
      await adminUpdate({ password: "isolated-replacement-test-password" });
    } finally {
      resume.release();
    }
    assert.ok((await outcome).error instanceof InvalidLogin);
    assert.equal(await prisma.session.count(), 0);
  },
);

test("Login committed first is revoked by the subsequent account update", async (t) => {
  t.mock.method(directory, "authenticate", async () => {});
  const login = await loginWithAssignedAuth("person", "isolated-ad-test-password");
  assert.ok(await getSessionByToken(login.token));
  await adminUpdate();
  assert.equal(await getSessionByToken(login.token), null);
  assert.equal(await prisma.session.count({ where: { revokedAt: null } }), 0);
  const local = await loginWithAssignedAuth("person", "isolated-local-test-password");
  assert.equal((await getSessionByToken(local.token)).user.authSource, "LOCAL");
});

// Instrument transaction queries without replacing database execution/isolation.
function interceptQueries(t, hook) {
  const transaction = prisma.$transaction.bind(prisma);
  t.after(() => Object.assign(prisma, { $transaction: transaction }));
  Object.assign(prisma, {
    $transaction: (callback, options) =>
      transaction(
        (tx) =>
          callback(
            new Proxy(tx, {
              get(db, model) {
                const delegate = db[model];
                if (!["user", "session", "activityLog"].includes(model)) {
                  return typeof delegate === "function" ? delegate.bind(db) : delegate;
                }
                return new Proxy(delegate, {
                  get(object, method) {
                    const value = object[method];
                    if (typeof value !== "function") return value;
                    return (args) =>
                      hook({ model, method, args, run: () => value.call(object, args) });
                  },
                });
              },
            }),
          ),
        options,
      ),
  });
}

test(
  "An overlapping access save cannot falsely report revocation when login owns the User write",
  { timeout: 10000 },
  async (t) => {
    t.mock.method(directory, "authenticate", async () => {});
    const inserted = gate();
    const resume = gate();
    const adminWriting = gate();
    let armed = true;
    interceptQueries(t, async ({ model, method, args, run }) => {
      if (model === "user" && method === "update" && args.data.username) adminWriting.release();
      const result = await run();
      if (model === "session" && method === "create" && armed) {
        armed = false;
        inserted.release();
        await resume.promise;
      }
      return result;
    });
    const loginPromise = loginWithAssignedAuth("person", "isolated-ad-test-password");
    await inserted.promise;
    const adminPromise = adminUpdate({ authSource: "AD", password: undefined }).then(
      (value) => ({ value }),
      (error) => ({ error }),
    );
    try {
      await adminWriting.promise;
    } finally {
      resume.release();
    }
    const login = await loginPromise;
    const admin = await adminPromise;
    assert.equal(
      admin.error?.code,
      "P2034",
      "the overlapping admin save must fail, not claim success",
    );
    assert.ok(await getSessionByToken(login.token));
    await adminUpdate({ authSource: "AD", password: undefined });
    assert.equal(await getSessionByToken(login.token), null);
  },
);

test("Failure after session INSERT rolls back both the session and last-login write", async (t) => {
  t.mock.method(directory, "authenticate", async () => {});
  interceptQueries(t, async ({ model, method, run }) => {
    const result = await run();
    if (model === "session" && method === "create") throw new Error("isolated post-insert failure");
    return result;
  });
  await assert.rejects(
    loginWithAssignedAuth("person", "isolated-ad-test-password"),
    /isolated post-insert failure/,
  );
  assert.equal(await prisma.session.count(), 0);
  assert.equal((await prisma.user.findUnique({ where: { id: "race-person" } })).lastLoginAt, null);
});

test("Failure after revocation rolls back account conversion and session revocation together", async (t) => {
  t.mock.method(directory, "authenticate", async () => {});
  const login = await loginWithAssignedAuth("person", "isolated-ad-test-password");
  const before = await prisma.user.findUnique({ where: { id: "race-person" } });
  interceptQueries(t, async ({ model, method, run }) => {
    const result = await run();
    if (model === "session" && method === "updateMany")
      throw new Error("isolated post-revocation failure");
    return result;
  });
  await assert.rejects(adminUpdate(), /isolated post-revocation failure/);
  assert.deepEqual(await prisma.user.findUnique({ where: { id: "race-person" } }), before);
  assert.equal((await getSessionByToken(login.token)).user.authSource, "AD");
});

test(
  "LOCAL-to-AD conversion rejects an in-flight old local-password login",
  { timeout: 10000 },
  async (t) => {
    await adminUpdate();
    t.mock.method(directory, "lookup", async () => ({ dn: "CN=Test", objectId: "test-guid" }));
    const { read, resume } = pauseValidationRead(t);
    const outcome = loginWithAssignedAuth("person", "isolated-local-test-password").then(
      (value) => ({ value }),
      (error) => ({ error }),
    );
    await read.promise;
    try {
      await adminUpdate({ authSource: "AD", password: undefined });
    } finally {
      resume.release();
    }
    assert.ok((await outcome).error instanceof InvalidLogin);
    assert.equal(await prisma.session.count(), 0);
  },
);
