import assert from "node:assert/strict";
import { test } from "node:test";
import { Client, InvalidCredentialsError } from "ldapts";
import {
  createDirectory,
  DirectoryUnavailable,
  InvalidLogin,
  escapeLdapFilter,
} from "../src/directory.js";
import { verifyAssignedCredentials, type AssignedAccount } from "../src/assigned-auth.js";
import { userCreateSchema, userUpdateSchema } from "../src/schemas.js";

const guid = Buffer.alloc(16, 7);
const cfg = {
  LDAP_URL: "ldaps://dc.example.test",
  LDAP_BIND_DN: "svc@example.test",
  LDAP_BIND_PASSWORD: "service-test",
  LDAP_BASE_DN: "DC=example,DC=test",
  LDAP_TIMEOUT_MS: 1000,
};
function fixture(
  options: {
    badUser?: boolean;
    failedService?: boolean;
    entries?: number;
    guid?: Buffer;
    startTls?: boolean;
    rejectUnauthorized?: boolean;
  } = {},
) {
  const events: string[] = [];
  const filters: string[] = [];
  let connections = 0;
  const directory = createDirectory(
    {
      ...cfg,
      LDAP_URL: options.startTls ? "ldap://dc.example.test" : cfg.LDAP_URL,
      LDAP_TLS_REJECT_UNAUTHORIZED: options.rejectUnauthorized,
    },
    (clientOptions) => {
      assert.equal(
        clientOptions.tlsOptions?.rejectUnauthorized,
        options.rejectUnauthorized !== false,
      );
      assert.equal(clientOptions.tlsOptions?.minVersion, "TLSv1.2");
      const id = connections++;
      return {
        startTLS: async () => {
          events.push(`tls:${id}`);
        },
        bind: async (dn: string, _password: string) => {
          events.push(`bind:${id}:${dn}`);
          if (id === 0 && options.failedService) throw new Error("secret-service-detail");
          if (id === 1 && options.badUser) throw new InvalidCredentialsError();
        },
        search: async (_base: string, params: { filter: string }) => {
          filters.push(params.filter);
          return {
            searchEntries: Array.from({ length: options.entries ?? 1 }, () => ({
              dn: "CN=Person,DC=example,DC=test",
              objectGUID: options.guid ?? guid,
            })),
          };
        },
        unbind: async () => {
          events.push(`close:${id}`);
        },
      } as unknown as Client;
    },
  );
  return { directory, events, filters };
}
const account: AssignedAccount = {
  username: "person",
  authSource: "AD",
  adObjectId: guid.toString("base64"),
  isActive: true,
  deletedAt: null,
  passwordHash: "unused",
};

test("Only assigned, active accounts reach AD; empty passwords never bind", async () => {
  let calls = 0;
  const deps = {
    authenticate: async () => {
      calls++;
    },
    compare: async () => {
      calls++;
      return true;
    },
  };
  for (const user of [null, { ...account, isActive: false }, { ...account, deletedAt: new Date() }])
    await assert.rejects(verifyAssignedCredentials(user, "password", deps), InvalidLogin);
  await assert.rejects(verifyAssignedCredentials(account, "", deps), InvalidLogin);
  assert.equal(calls, 0);
});
test("AD failure never falls back to local password; local accounts never call AD", async () => {
  let comparisons = 0;
  let binds = 0;
  const deps = {
    authenticate: async () => {
      binds++;
      throw new DirectoryUnavailable();
    },
    compare: async () => {
      comparisons++;
      return true;
    },
  };
  await assert.rejects(verifyAssignedCredentials(account, "password", deps), DirectoryUnavailable);
  assert.equal(comparisons, 0);
  await verifyAssignedCredentials({ ...account, authSource: "LOCAL" }, "password", deps);
  assert.equal(binds, 1);
  assert.equal(comparisons, 1);
});
test("AD identity lookup precedes user bind and closes both connections", async () => {
  const { directory, events } = fixture();
  await directory.authenticate("person", "user-password", guid.toString("base64"));
  assert.deepEqual(events, [
    "bind:0:svc@example.test",
    "close:0",
    "bind:1:CN=Person,DC=example,DC=test",
    "close:1",
  ]);
});
test("StartTLS occurs before any service or user password is sent", async () => {
  const { directory, events } = fixture({ startTls: true });
  await directory.authenticate("person", "password", guid.toString("base64"));
  assert.equal(events[0], "tls:0");
  assert.equal(events[3], "tls:1");
});
test("Wrong password has a generic failure; service errors are unavailable with no details", async () => {
  await assert.rejects(
    fixture({ badUser: true }).directory.authenticate("person", "wrong", guid.toString("base64")),
    InvalidLogin,
  );
  await assert.rejects(
    fixture({ failedService: true }).directory.lookup("person"),
    (error) =>
      error instanceof DirectoryUnavailable && !error.message.includes("secret-service-detail"),
  );
});
test("Missing/ambiguous/changed identities cannot authenticate", async () => {
  for (const options of [{ entries: 0 }, { entries: 2 }, { guid: Buffer.alloc(16, 8) }]) {
    const { directory, events } = fixture(options);
    await assert.rejects(
      directory.authenticate("person", "password", guid.toString("base64")),
      InvalidLogin,
    );
    assert.equal(events.filter((x) => x.startsWith("bind:")).length, 1);
  }
});
test("LDAP filter injection is escaped and UPN uses an exact UPN filter", async () => {
  assert.equal(escapeLdapFilter("a*)(x=\u0000\\"), "a\\2a\\29\\28x=\\00\\5c");
  const { directory, filters } = fixture();
  await directory.lookup("name@example.test");
  assert.ok(filters[0].includes("(userPrincipalName=name@example.test)"));
  assert.ok(filters[0].includes("userAccountControl"));
});
test("Assignment schemas accept password-free AD, reject invalid sources and short local passwords", () => {
  const base = { username: "person", role: "OPERATOR", isActive: true };
  assert.equal(userCreateSchema.safeParse({ ...base, authSource: "AD" }).success, true);
  assert.equal(userUpdateSchema.safeParse({ ...base, authSource: "AD" }).success, true);
  assert.equal(userCreateSchema.safeParse({ ...base, authSource: "OTHER" }).success, false);
  assert.equal(
    userCreateSchema.safeParse({ ...base, authSource: "LOCAL", password: "x" }).success,
    false,
  );
});

test("AD account assignment stores directory identity and portal role, never an AD password", async (t) => {
  const { directory } = await import("../src/directory.js");
  const { prisma } = await import("../src/prisma.js");
  const { createUserRecord } = await import("../src/repository.js");
  t.mock.method(directory, "lookup", async () => ({
    dn: "CN=Person",
    objectId: guid.toString("base64"),
  }));
  let saved: Record<string, unknown> = {};
  const tx = {
    user: {
      findFirst: async () => null,
      create: async ({ data }: { data: Record<string, unknown> }) => {
        saved = data;
        return { id: "assigned", ...data };
      },
    },
    activityLog: { create: async () => undefined },
  };
  const original = prisma.$transaction;
  Object.assign(prisma, { $transaction: async (fn: (db: typeof tx) => unknown) => fn(tx) });
  t.after(() => Object.assign(prisma, { $transaction: original }));
  const result = await createUserRecord({
    username: "person",
    authSource: "AD",
    role: "VIEWER",
    isActive: true,
    createdById: "admin",
  });
  assert.equal(result.authSource, "AD");
  assert.equal(result.role, "VIEWER");
  assert.equal(saved.adObjectId, guid.toString("base64"));
  assert.match(String(saved.passwordHash), /^\$2/);
  assert.equal("password" in saved, false);
});

test("Disabling assigned AD access works during directory outage and revokes sessions", async (t) => {
  const { directory } = await import("../src/directory.js");
  const { prisma } = await import("../src/prisma.js");
  const { updateUserRecord } = await import("../src/repository.js");
  let directoryCalls = 0;
  let revoked = false;
  t.mock.method(directory, "lookup", async () => {
    directoryCalls++;
    throw new DirectoryUnavailable();
  });
  const existing = {
    ...account,
    id: "assigned",
    role: "VIEWER",
    updatedAt: new Date(),
    lastLoginAt: null,
  };
  const lookupOriginal = prisma.user.findUnique;
  Object.assign(prisma.user, { findUnique: async () => existing });
  t.after(() => Object.assign(prisma.user, { findUnique: lookupOriginal }));
  const tx = {
    user: {
      findUnique: async () => existing,
      findFirst: async () => null,
      update: async ({ data }: { data: object }) => ({ ...existing, ...data }),
    },
    session: {
      updateMany: async () => {
        revoked = true;
      },
    },
    activityLog: { create: async () => undefined },
  };
  const original = prisma.$transaction;
  Object.assign(prisma, { $transaction: async (fn: (db: typeof tx) => unknown) => fn(tx) });
  t.after(() => Object.assign(prisma, { $transaction: original }));
  const result = await updateUserRecord({
    userId: "assigned",
    username: "person",
    authSource: "AD",
    role: "VIEWER",
    isActive: false,
    updatedById: "admin",
  });
  assert.equal(result.isActive, false);
  assert.equal(revoked, true);
  assert.equal(directoryCalls, 0);
});

test("The last local recovery administrator cannot be removed even when AD administrators exist", async (t) => {
  const { prisma } = await import("../src/prisma.js");
  const { deleteUserRecord } = await import("../src/repository.js");
  const tx = {
    user: {
      findUnique: async () => ({
        id: "recovery",
        role: "ADMINISTRATOR",
        authSource: "LOCAL",
        isActive: true,
        deletedAt: null,
      }),
      count: async ({ where }: { where: { authSource: string } }) => {
        assert.equal(where.authSource, "LOCAL");
        return 0;
      },
    },
  };
  const original = prisma.$transaction;
  Object.assign(prisma, { $transaction: async (fn: (db: typeof tx) => unknown) => fn(tx) });
  t.after(() => Object.assign(prisma, { $transaction: original }));
  await assert.rejects(
    deleteUserRecord({ userId: "recovery", deletedById: "other-admin" }),
    /local Administrator/,
  );
});

test("Explicit certificate opt-out retains TLS on both service and user connections", async () => {
  for (const startTls of [false, true]) {
    const { directory, events } = fixture({ startTls, rejectUnauthorized: false });
    await directory.authenticate("person", "password", guid.toString("base64"));
    assert.equal(events.filter((event) => event.startsWith("bind:")).length, 2);
    if (startTls) {
      assert.equal(events[0], "tls:0");
      assert.equal(events[3], "tls:1");
    }
  }
});
